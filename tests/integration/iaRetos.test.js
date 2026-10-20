import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Tarea from '../../src/models/Tarea.js';
import Evento from '../../src/models/Evento.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { armarDescripcionHtml } from '../../src/services/ia/retoEscuelaPadres.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { crearPadre, crearDocente, crearInstitucion, crearCurso, crearModulo, crearTarea, crearEvento } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

// GROQ_API_KEY vacía en tests: el reto sale de la plantilla armada con las fichas

const cursoConFamilia = async () => {
  const institucion = await crearInstitucion();
  const docente = await crearDocente({ institucionId: institucion._id });
  const padre = await crearPadre({ institucionId: institucion._id });
  const curso = await crearCurso({
    institucionId: institucion._id,
    docenteId: docente._id,
    participantes: [
      { usuarioId: docente._id, etiqueta: 'docente' },
      { usuarioId: padre._id, etiqueta: 'padre' },
    ],
  });
  const modulo = await crearModulo({ cursoId: curso._id });
  return { docente, padre, curso, modulo };
};

describe('Borrador de reto de escuela de padres', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('lista los 5 ejes del Decreto 459 como guía', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/ia/temas');
    expect(res.body.ejes).toHaveLength(5);
  });

  it('acepta un tema libre y lo ubica en su eje', async () => {
    await cargarFichas();
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/ia/retos/borrador').send({ tema: 'Uso del celular antes de dormir' });

    expect(res.status).toBe(200);
    const { borrador } = res.body;
    expect(borrador.eje).toBe('estilos_vida_saludable');
    expect(borrador.tema).toBe('Uso del celular antes de dormir');
    expect(borrador.descripcionHtml).toMatch(/Qué hacer en casa/);
    expect(borrador.descripcionHtml.length).toBeLessThanOrEqual(2000);
    expect(borrador.criteriosHtml).toMatch(/<ul>/);
    expect(borrador.basadoEnFichas).toBe(true);
  });

  it('también funciona eligiendo eje y subtema de la lista', async () => {
    await cargarFichas();
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/ia/retos/borrador').send({ eje: 'crianza_amorosa', subtema: 'rabietas' });
    expect(res.status).toBe(200);
    expect(res.body.borrador.subtema).toBe('rabietas');
  });

  it.each([
    [{}, 'sin tema ni eje'],
    [{ eje: 'deportes' }, 'eje inválido'],
    [{ eje: 'crianza_amorosa', subtema: 'pantallas' }, 'subtema de otro eje'],
  ])('rechaza %o (%s)', async (body) => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    expect((await agent.post('/api/ia/retos/borrador').send(body)).status).toBe(400);
  });

  it('sin IA y sin fichas que lo respalden responde 404 en vez de inventar', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.post('/api/ia/retos/borrador').send({ tema: 'Cómo celebrar cumpleaños' });
    expect(res.status).toBe(404);
  });

  it('un padre no puede generar retos', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    expect((await agent.post('/api/ia/retos/borrador').send({ tema: 'celular' })).status).toBe(403);
  });

  it('el HTML se recorta para caber en la descripción de una tarea', () => {
    const largo = 'x'.repeat(300);
    const html = armarDescripcionHtml({
      introduccion: largo, objetivo: largo, pasos: [largo, largo, largo, largo, largo], reflexion: [largo, largo, largo],
    });
    expect(html.length).toBeLessThanOrEqual(2000);
  });
});

describe('Sugerencias de módulos de escuela de padres', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('sugiere 4 módulos para el curso sin repetir los que ya tiene', async () => {
    const { docente, curso } = await cursoConFamilia();
    await crearModulo({ cursoId: curso._id, titulo: 'Crianza respetuosa' });
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/ia/modulos/sugerencias').send({ cursoId: curso._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.modulos).toHaveLength(4);
    expect(res.body.modulos.map((m) => m.titulo)).not.toContain('Crianza respetuosa');
    for (const m of res.body.modulos) {
      expect(m.ejeLabel).toBeTruthy();
      expect(m.ideasRetos.length).toBeGreaterThan(0);
    }
  });

  it('no sugiere módulos para un curso ajeno (404)', async () => {
    const { curso } = await cursoConFamilia();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    expect((await agent.post('/api/ia/modulos/sugerencias').send({ cursoId: curso._id.toString() })).status).toBe(404);
  });

  it('el borrador de reto acepta el curso y el módulo como contexto', async () => {
    await cargarFichas();
    const { docente, curso, modulo } = await cursoConFamilia();
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/ia/retos/borrador').send({
      tema: 'celular antes de dormir', cursoId: curso._id.toString(), moduloId: modulo._id.toString(),
    });
    expect(res.status).toBe(200);
    expect(res.body.borrador.subtema).toBe('pantallas');
  });

  it('con tema libre no mezcla fichas de otro tema del eje elegido', async () => {
    await cargarFichas();
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);

    // "huerta escolar" no tiene fichas: aunque el docente elija un eje, no se usan fichas de pantallas/alimentación
    const res = await agent.post('/api/ia/retos/borrador').send({ tema: 'Huerta escolar en familia', eje: 'estilos_vida_saludable' });
    // sin IA y sin fichas del tema no hay forma de generarlo → 404 en vez de un reto mezclado
    expect(res.status).toBe(404);

    // "mentiras" sí tiene ficha (límites): se usa esa, no las del eje elegido
    const conFicha = await agent.post('/api/ia/retos/borrador').send({ tema: 'Mentiras en la infancia', eje: 'estilos_vida_saludable' });
    expect(conFicha.status).toBe(200);
    expect(conFicha.body.borrador.subtema).toBe('limites');
  });
});

describe('Publicar el reto y que Edumon lo sugiera', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  it('crear la tarea con los campos de escuela de padres guarda el tema', async () => {
    const { docente, curso, modulo } = await cursoConFamilia();
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/tareas')
      .field('titulo', 'Reto en familia: pantallas')
      .field('descripcion', '<p>Actividad en casa</p>')
      .field('fechaEntrega', new Date(Date.now() + 7 * 86400000).toISOString())
      .field('tipoEntrega', 'texto')
      .field('asignacionTipo', 'todos')
      .field('cursoId', curso._id.toString())
      .field('moduloId', modulo._id.toString())
      .field('escuelaPadresEje', 'estilos_vida_saludable')
      .field('escuelaPadresSubtema', 'pantallas')
      .field('escuelaPadresTema', 'Celular antes de dormir');

    expect(res.status).toBe(201);
    const tarea = await Tarea.findOne({ titulo: 'Reto en familia: pantallas' }).lean();
    expect(tarea.escuelaPadres).toEqual({ eje: 'estilos_vida_saludable', subtema: 'pantallas', tema: 'Celular antes de dormir' });
  });

  it('un reto normal no queda marcado como escuela de padres', async () => {
    const tarea = await crearTarea();
    expect((await Tarea.findById(tarea._id).lean()).escuelaPadres).toBeNull();
  });

  const chatear = async (padre, contenido) => {
    const agent = await loginComo(app, padre);
    await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    const { body } = await agent.post('/api/ia/conversaciones');
    return agent.post(`/api/ia/conversaciones/${body.conversacion._id}/mensajes`).send({ contenido });
  };

  it('Edumon invita al reto abierto del mismo tema en el curso de la familia', async () => {
    const { docente, padre, curso, modulo } = await cursoConFamilia();
    await crearTarea({
      docenteId: docente._id, cursoId: curso._id, moduloId: modulo._id,
      titulo: 'Reto: pantallas en familia',
      escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'pantallas' },
    });

    const res = await chatear(padre, 'mi hijo de 9 años no suelta el celular');
    expect(res.body.respuesta.retoSugerido.titulo).toBe('Reto: pantallas en familia');
  });

  it('no sugiere retos cerrados ni de cursos ajenos', async () => {
    const { docente, padre, curso, modulo } = await cursoConFamilia();
    const otro = await cursoConFamilia();
    await crearTarea({
      docenteId: docente._id, cursoId: curso._id, moduloId: modulo._id, estado: 'cerrada',
      escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'pantallas' },
    });
    await crearTarea({
      docenteId: otro.docente._id, cursoId: otro.curso._id, moduloId: otro.modulo._id,
      escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'pantallas' },
    });

    const res = await chatear(padre, 'mi hijo de 9 años no suelta el celular');
    expect(res.body.respuesta.retoSugerido).toBeNull();
  });

  it('el docente marca un evento para que Edumon lo recomiende y el chat lo sugiere', async () => {
    const { docente, padre, curso } = await cursoConFamilia();
    const agent = await loginComo(app, docente);
    const res = await agent.post('/api/eventos').send({
      titulo: 'Charla: pantallas en casa',
      descripcion: 'Encuentro con las familias sobre el uso de pantallas.',
      fechaInicio: new Date(Date.now() + 2 * 86400000).toISOString(),
      fechaFin: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(),
      hora: '18:00',
      ubicacion: 'Auditorio',
      cursosIds: [curso._id.toString()],
      categoria: 'escuela_padres',
      escuelaPadresEje: 'estilos_vida_saludable',
      escuelaPadresSubtema: 'pantallas',
    });
    expect(res.status).toBe(201);
    expect((await Evento.findById(res.body.evento._id).lean()).escuelaPadres.eje).toBe('estilos_vida_saludable');

    const chat = await chatear(padre, 'mi hijo de 9 años no suelta el celular');
    expect(chat.body.respuesta.eventoSugerido.titulo).toBe('Charla: pantallas en casa');
  });

  it('un evento sin marcar no se recomienda, y quitar la marca deja de recomendarlo', async () => {
    const { docente, padre, curso } = await cursoConFamilia();
    const sinMarca = await crearEvento({ docenteId: docente._id, cursosIds: [curso._id], categoria: 'escuela_padres' });
    const marcado = await crearEvento({
      docenteId: docente._id, cursosIds: [curso._id],
      escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'pantallas' },
    });
    expect((await Evento.findById(sinMarca._id).lean()).escuelaPadres).toBeNull();

    const agent = await loginComo(app, docente);
    const res = await agent.put(`/api/eventos/${marcado._id}`).send({ escuelaPadresEje: '' });
    expect(res.status).toBe(200);
    expect((await Evento.findById(marcado._id).lean()).escuelaPadres).toBeNull();

    const chat = await chatear(padre, 'mi hijo de 9 años no suelta el celular');
    expect(chat.body.respuesta.eventoSugerido).toBeNull();
  });
});
