import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import crearApp from '../../src/app.js';
import Entrega from '../../src/models/Entrega.js';
import User from '../../src/models/User.js';
import { crearCurso, crearTarea, crearEntrega, crearPadre, crearDocente, crearAdministrador, crearSuperadmin, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const FIXTURES = path.resolve(__dirname, '../fixtures');

async function tareaConPadreParticipante(overrides = {}) {
  const padre = await crearPadre();
  const curso = await crearCurso();
  curso.agregarParticipante(padre._id, 'padre');
  await curso.save();
  const tarea = await crearTarea({ cursoId: curso._id, docenteId: curso.docenteId, asignacionTipo: 'todos', ...overrides });
  return { padre, curso, tarea };
}

describe('POST /api/entregas', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el padre participante crea una entrega en borrador para sí mismo', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/entregas').send({
      tareaId: tarea._id.toString(), padreId: padre._id.toString(), textoRespuesta: 'Mi respuesta',
    });

    expect(res.status).toBe(201);
    expect(res.body.entrega.estado).toBe('borrador');
  });

  it('CRÍTICO: no puede crear una entrega en nombre de otro padre', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const otroPadre = await crearPadre();
    const agent = await loginComo(app, otroPadre);

    const res = await agent.post('/api/entregas').send({
      tareaId: tarea._id.toString(), padreId: (await crearPadre())._id.toString(), textoRespuesta: 'x',
    });
    // canCreateEntrega corre antes que el controlador y corta con 403 apenas
    // ve que padreId no es el usuario autenticado (el validator también lo
    // marcaría como error, pero nunca llega a evaluarse en el controlador).
    expect(res.status).toBe(403);
  });

  it('un padre que no participa del curso no puede entregar', async () => {
    const tarea = await crearTarea();
    const padreAjeno = await crearPadre();
    const agent = await loginComo(app, padreAjeno);

    const res = await agent.post('/api/entregas').send({
      tareaId: tarea._id.toString(), padreId: padreAjeno._id.toString(), textoRespuesta: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('no permite una segunda entrega para la misma tarea (409)', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    await crearEntrega({ tareaId: tarea._id, padreId: padre._id });
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/entregas').send({
      tareaId: tarea._id.toString(), padreId: padre._id.toString(), textoRespuesta: 'x',
    });
    expect(res.status).toBe(409);
  });

  it('rechaza entregar en una tarea cerrada', async () => {
    const { padre, tarea } = await tareaConPadreParticipante({ estado: 'cerrada' });
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/entregas').send({
      tareaId: tarea._id.toString(), padreId: padre._id.toString(), textoRespuesta: 'x',
    });
    expect(res.status).toBe(400);
  });

  it('marca la entrega como "tarde" si se envía directamente después de la fecha límite', async () => {
    const { padre, tarea } = await tareaConPadreParticipante({ fechaEntrega: new Date(Date.now() - 60000) });
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/entregas').send({
      tareaId: tarea._id.toString(), padreId: padre._id.toString(), textoRespuesta: 'x', estado: 'enviada',
    });
    expect(res.status).toBe(201);
    expect(res.body.entrega.estado).toBe('tarde');
  });

  it('adjunta archivos a Cloudinary al crear la entrega', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/entregas')
      .field('tareaId', tarea._id.toString())
      .field('padreId', padre._id.toString())
      .attach('archivos', path.join(FIXTURES, 'mini.pdf'));

    expect(res.status).toBe(201);
    expect(res.body.entrega.archivosAdjuntos).toHaveLength(1);
  });
});

describe('IDOR corregido: /api/entregas/tarea/:tareaId y /api/entregas/padre/:padreId', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un padre NO puede leer las entregas de una tarea por tareaId (antes era posible)', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const padreCualquiera = await crearPadre();
    const agent = await loginComo(app, padreCualquiera);

    const res = await agent.get(`/api/entregas/tarea/${tarea._id}`);
    expect(res.status).toBe(403);
  });

  it('el docente de la tarea sí puede leer las entregas por tareaId', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.get(`/api/entregas/tarea/${tarea._id}`);
    expect(res.status).toBe(200);
  });

  it('un padre NO puede leer las entregas de otro padre por padreId (antes era posible)', async () => {
    const otroPadre = await crearPadre();
    const agent = await loginComo(app, await crearPadre());

    const res = await agent.get(`/api/entregas/padre/${otroPadre._id}`);
    expect(res.status).toBe(403);
  });

  it('CORREGIDO: un docente que no da clases en el curso de la tarea no puede leer sus entregas', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const docenteAjeno = await crearDocente();
    const agent = await loginComo(app, docenteAjeno);

    const res = await agent.get(`/api/entregas/tarea/${tarea._id}`);
    expect(res.status).toBe(403);
  });

  it('CORREGIDO: un administrador de otra institución no puede leer entregas de una tarea ajena', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const adminAjeno = await crearAdministrador();
    const agent = await loginComo(app, adminAjeno);

    const res = await agent.get(`/api/entregas/tarea/${tarea._id}`);
    expect(res.status).toBe(403);
  });

  it('un administrador de la MISMA institución sí puede leer entregas por tareaId', async () => {
    const { tarea, curso } = await tareaConPadreParticipante();
    const admin = await crearAdministrador({ institucionId: curso.institucionId });
    const agent = await loginComo(app, admin);

    const res = await agent.get(`/api/entregas/tarea/${tarea._id}`);
    expect(res.status).toBe(200);
  });

  it('CORREGIDO: un docente que no comparte curso con el padre no puede leer sus entregas por padreId', async () => {
    const { padre } = await tareaConPadreParticipante();
    const docenteAjeno = await crearDocente();
    const agent = await loginComo(app, docenteAjeno);

    const res = await agent.get(`/api/entregas/padre/${padre._id}`);
    expect(res.status).toBe(403);
  });

  it('CORREGIDO: un administrador de otra institución no puede leer entregas de un padre ajeno', async () => {
    const { padre } = await tareaConPadreParticipante();
    const adminAjeno = await crearAdministrador();
    const agent = await loginComo(app, adminAjeno);

    const res = await agent.get(`/api/entregas/padre/${padre._id}`);
    expect(res.status).toBe(403);
  });
});

describe('CORREGIDO: GET /api/entregas — un administrador solo ve entregas de su propia institución', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('filtra las entregas listadas por la institución del administrador', async () => {
    const institucionA = await crearInstitucion();
    const institucionB = await crearInstitucion();

    const { tarea: tareaA, padre: padreA } = await tareaConPadreParticipante({});
    // Fuerza la tarea/curso de A a la institución A explícitamente
    const cursoA = await import('../../src/models/Curso.js').then((m) => m.default.findById(tareaA.cursoId));
    cursoA.institucionId = institucionA._id;
    await cursoA.save();

    const { tarea: tareaB, padre: padreB } = await tareaConPadreParticipante({});
    const cursoB = await import('../../src/models/Curso.js').then((m) => m.default.findById(tareaB.cursoId));
    cursoB.institucionId = institucionB._id;
    await cursoB.save();

    await crearEntrega({ tareaId: tareaA._id, padreId: padreA._id, estado: 'enviada' });
    await crearEntrega({ tareaId: tareaB._id, padreId: padreB._id, estado: 'enviada' });

    const adminA = await crearAdministrador({ institucionId: institucionA._id });
    const agent = await loginComo(app, adminA);

    const res = await agent.get('/api/entregas');
    expect(res.status).toBe(200);
    expect(res.body.entregas).toHaveLength(1);
    expect(res.body.entregas[0].tareaId._id).toBe(tareaA._id.toString());
  });
});

describe('Ciclo de vida de una entrega (borrador → enviada/tarde → calificada)', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el padre dueño puede editar su entrega mientras está en borrador', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id, estado: 'borrador' });
    const agent = await loginComo(app, padre);

    const res = await agent.put(`/api/entregas/${entrega._id}`).send({ textoRespuesta: 'Respuesta editada' });
    expect(res.status).toBe(200);
    expect(res.body.entrega.textoRespuesta).toBe('Respuesta editada');
  });

  it('no se puede editar una entrega ya enviada', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id, estado: 'enviada' });
    const agent = await loginComo(app, padre);

    const res = await agent.put(`/api/entregas/${entrega._id}`).send({ textoRespuesta: 'x' });
    expect(res.status).toBe(400);
  });

  it('enviar una entrega en borrador la pasa a "enviada" (o "tarde" si venció)', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id, estado: 'borrador' });
    const agent = await loginComo(app, padre);

    const res = await agent.patch(`/api/entregas/${entrega._id}/enviar`);
    expect(res.status).toBe(200);
    expect(res.body.entrega.estado).toBe('enviada');
  });

  it('no se puede eliminar una entrega que ya no está en borrador', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id, estado: 'enviada' });
    const agent = await loginComo(app, padre);

    const res = await agent.delete(`/api/entregas/${entrega._id}`);
    expect(res.status).toBe(400);
  });

  it('CRÍTICO: docenteId de la calificación sale del token, nunca del body', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, estado: 'enviada' });
    const docente = await User.findById(tarea.docenteId);
    const otroUsuarioId = (await crearDocente())._id.toString();
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/entregas/${entrega._id}/calificar`).send({
      valoracion: 5, comentario: 'Excelente', docenteId: otroUsuarioId,
    });

    // El validator bloquea explícitamente que "docenteId" venga en el body
    expect(res.status).toBe(400);
  });

  it('el docente asignado califica correctamente con valoracion 1-5', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, estado: 'enviada' });
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/entregas/${entrega._id}/calificar`).send({ valoracion: 4, comentario: 'Buen trabajo' });

    expect(res.status).toBe(200);
    expect(res.body.entrega.calificacion.valoracion).toBe(4);
    expect(res.body.entrega.calificacion.docenteId._id.toString()).toBe(docente._id.toString());
  });

  it('un docente que no es el asignado no puede calificar', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, estado: 'enviada' });
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.patch(`/api/entregas/${entrega._id}/calificar`).send({ valoracion: 3 });
    expect(res.status).toBe(403);
  });

  it('rechaza una valoracion fuera de 1-5', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, estado: 'enviada' });
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/entregas/${entrega._id}/calificar`).send({ valoracion: 8 });
    expect(res.status).toBe(400);
  });

  it('no se puede calificar una entrega en borrador', async () => {
    const { tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, estado: 'borrador' });
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/entregas/${entrega._id}/calificar`).send({ valoracion: 3 });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/entregas/:id/archivos/:archivoId', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el dueño quita un archivo adjunto mientras la entrega está en borrador', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({
      tareaId: tarea._id, padreId: padre._id, estado: 'borrador',
      archivosAdjuntos: [{ url: 'http://cloud/x.pdf', publicId: 'carpeta/x', nombreOriginal: 'x.pdf', tipoArchivo: 'application/pdf', tamano: 1000 }],
    });
    const archivoId = entrega.archivosAdjuntos[0]._id;
    const agent = await loginComo(app, padre);

    const res = await agent.delete(`/api/entregas/${entrega._id}/archivos/${archivoId}`);
    expect(res.status).toBe(200);
    expect((await Entrega.findById(entrega._id)).archivosAdjuntos).toHaveLength(0);
  });

  it('no permite quitar archivos si la entrega ya no está en borrador', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({
      tareaId: tarea._id, padreId: padre._id, estado: 'enviada',
      archivosAdjuntos: [{ url: 'http://cloud/x.pdf', publicId: 'carpeta/x', nombreOriginal: 'x.pdf', tipoArchivo: 'application/pdf', tamano: 1000 }],
    });
    const archivoId = entrega.archivosAdjuntos[0]._id;
    const agent = await loginComo(app, padre);

    const res = await agent.delete(`/api/entregas/${entrega._id}/archivos/${archivoId}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/entregas/:id — acceso compartido', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el padre dueño, el docente de la tarea pueden ver; un tercero no', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id });
    const docente = await User.findById(tarea.docenteId);
    const tercero = await crearPadre();

    const agentPadre = await loginComo(app, padre);
    const agentDocente = await loginComo(app, docente);
    const agentTercero = await loginComo(app, tercero);

    expect((await agentPadre.get(`/api/entregas/${entrega._id}`)).status).toBe(200);
    expect((await agentDocente.get(`/api/entregas/${entrega._id}`)).status).toBe(200);
    expect((await agentTercero.get(`/api/entregas/${entrega._id}`)).status).toBe(403);
  });

  it('CORREGIDO: un administrador de la misma institución puede ver la entrega; uno de otra institución no', async () => {
    const { padre, tarea, curso } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id });

    const adminPropio = await crearAdministrador({ institucionId: curso.institucionId });
    const adminAjeno = await crearAdministrador();

    const agentPropio = await loginComo(app, adminPropio);
    const agentAjeno = await loginComo(app, adminAjeno);

    expect((await agentPropio.get(`/api/entregas/${entrega._id}`)).status).toBe(200);
    expect((await agentAjeno.get(`/api/entregas/${entrega._id}`)).status).toBe(403);
  });

  it('un superadmin puede ver cualquier entrega', async () => {
    const { padre, tarea } = await tareaConPadreParticipante();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id });
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.get(`/api/entregas/${entrega._id}`);
    expect(res.status).toBe(200);
  });
});
