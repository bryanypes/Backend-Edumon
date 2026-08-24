import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import MensajeForo from '../../src/models/MensajeForo.js';
import Notificacion from '../../src/models/Notificacion.js';
import User from '../../src/models/User.js';
import { crearCurso, crearForo, crearMensajeForo, crearDocente, crearPadre } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

async function foroConPadreParticipante(overridesForo = {}) {
  const padre = await crearPadre();
  const curso = await crearCurso();
  curso.agregarParticipante(padre._id, 'padre');
  await curso.save();
  const foro = await crearForo({ cursoId: curso._id, docenteId: curso.docenteId, ...overridesForo });
  return { padre, curso, foro };
}

describe('POST /api/mensajes-foro', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un participante del curso publica un mensaje en el foro', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/mensajes-foro').send({ foroId: foro._id.toString(), contenido: 'Hola, tengo una duda' });
    expect(res.status).toBe(201);
  });

  it('un usuario ajeno al curso no puede publicar', async () => {
    const { foro } = await foroConPadreParticipante();
    const ajeno = await crearPadre();
    const agent = await loginComo(app, ajeno);

    const res = await agent.post('/api/mensajes-foro').send({ foroId: foro._id.toString(), contenido: 'Intento ajeno' });
    expect(res.status).toBe(403);
  });

  it('no se puede publicar en un foro cerrado', async () => {
    const { padre, foro } = await foroConPadreParticipante({ estado: 'cerrado' });
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/mensajes-foro').send({ foroId: foro._id.toString(), contenido: 'Foro cerrado' });
    expect(res.status).toBe(403);
  });

  it('un padre solo puede responder a mensajes de docentes/administradores, no de otros padres', async () => {
    const { padre, foro, curso } = await foroConPadreParticipante();
    const otroPadre = await crearPadre();
    curso.agregarParticipante(otroPadre._id, 'padre');
    await curso.save();
    const mensajeDeOtroPadre = await crearMensajeForo({ foroId: foro._id, usuarioId: otroPadre._id });

    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/mensajes-foro').send({
      foroId: foro._id.toString(), contenido: 'Respondiendo a otro padre', respuestaA: mensajeDeOtroPadre._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('un padre sí puede responder a un mensaje del docente', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const mensajeDocente = await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId });

    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/mensajes-foro').send({
      foroId: foro._id.toString(), contenido: 'Gracias profe', respuestaA: mensajeDocente._id.toString(),
    });
    expect(res.status).toBe(201);
  });

  it('no permite responder a una respuesta (solo un nivel de anidación)', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const raiz = await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId });
    const respuesta = await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId, respuestaA: raiz._id });

    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/mensajes-foro').send({
      foroId: foro._id.toString(), contenido: 'Respuesta anidada', respuestaA: respuesta._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('rechaza contenido vacío', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/mensajes-foro').send({ foroId: foro._id.toString(), contenido: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/mensajes-foro — notificaciones', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  const esperarNotificacion = async (filtro, timeoutMs = 2000) => {
    const inicio = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const encontrada = await Notificacion.findOne(filtro);
      if (encontrada) return encontrada;
      if (Date.now() - inicio > timeoutMs) return null;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  it('un mensaje raíz de un padre notifica al docente (pero no al propio autor)', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const agent = await loginComo(app, padre);

    await agent.post('/api/mensajes-foro').send({ foroId: foro._id.toString(), contenido: 'Tengo una pregunta' });

    const notifDocente = await esperarNotificacion({ usuarioId: foro.docenteId, tipo: 'foro' });
    expect(notifDocente).not.toBeNull();
    expect(await Notificacion.findOne({ usuarioId: padre._id, tipo: 'foro' })).toBeNull();
  });

  it('una respuesta de un padre a otro padre NO genera notificación', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const mensajeDocente = await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId });
    const agent = await loginComo(app, padre);

    await agent.post('/api/mensajes-foro').send({
      foroId: foro._id.toString(), contenido: 'Gracias profe', respuestaA: mensajeDocente._id.toString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await Notificacion.findOne({ tipo: 'foro' })).toBeNull();
  });

  it('una respuesta del docente sí notifica a los padres del curso', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const mensajeDePadre = await crearMensajeForo({ foroId: foro._id, usuarioId: padre._id });
    const docente = await User.findById(foro.docenteId);
    const agent = await loginComo(app, docente);

    await agent.post('/api/mensajes-foro').send({
      foroId: foro._id.toString(), contenido: 'Claro, te explico', respuestaA: mensajeDePadre._id.toString(),
    });

    const notifPadre = await esperarNotificacion({ usuarioId: padre._id, tipo: 'foro' });
    expect(notifPadre).not.toBeNull();
    expect(notifPadre.mensaje).toContain('respondió en');
  });
});

describe('GET /api/mensajes-foro/foro/:foroId', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('agrupa las respuestas bajo su mensaje raíz correspondiente', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const raiz = await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId, contenido: 'Mensaje raíz' });
    await crearMensajeForo({ foroId: foro._id, usuarioId: padre._id, contenido: 'Una respuesta', respuestaA: raiz._id });

    const agent = await loginComo(app, padre);
    const res = await agent.get(`/api/mensajes-foro/foro/${foro._id}`);

    expect(res.status).toBe(200);
    expect(res.body.mensajes).toHaveLength(1);
    expect(res.body.mensajes[0].respuestas).toHaveLength(1);
  });
});

describe('POST /api/mensajes-foro/:id/like', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('da y quita like alternadamente', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId });
    const agent = await loginComo(app, padre);

    const dar = await agent.post(`/api/mensajes-foro/${mensaje._id}/like`);
    expect(dar.status).toBe(200);
    expect(dar.body.likes).toBe(1);
    expect(dar.body.yaLeDioLike).toBe(true);

    const quitar = await agent.post(`/api/mensajes-foro/${mensaje._id}/like`);
    expect(quitar.body.likes).toBe(0);
    expect(quitar.body.yaLeDioLike).toBe(false);
  });
});

describe('PUT/DELETE de mensajes — moderación', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el autor puede editar su propio mensaje', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: padre._id, contenido: 'Original' });
    const agent = await loginComo(app, padre);

    const res = await agent.put(`/api/mensajes-foro/${mensaje._id}`).send({ contenido: 'Editado' });
    expect(res.status).toBe(200);
    expect(res.body.mensaje.contenido).toBe('Editado');
  });

  it('otro padre no puede editar el mensaje ajeno', async () => {
    const { foro } = await foroConPadreParticipante();
    const autor = await crearPadre();
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: autor._id });
    const otro = await crearPadre();
    const agent = await loginComo(app, otro);

    const res = await agent.put(`/api/mensajes-foro/${mensaje._id}`).send({ contenido: 'Hackeado' });
    expect(res.status).toBe(403);
  });

  it('el docente puede eliminar (moderar) el mensaje de un padre en su propio curso', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: padre._id });
    const docente = await User.findById(foro.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.delete(`/api/mensajes-foro/${mensaje._id}`);
    expect(res.status).toBe(200);
    expect(await MensajeForo.findById(mensaje._id)).toBeNull();
  });

  it('un docente NO puede eliminar el mensaje de OTRO docente', async () => {
    const { foro } = await foroConPadreParticipante();
    const otroDocente = await crearDocente();
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: otroDocente._id });
    const docenteDelCurso = await User.findById(foro.docenteId);
    const agent = await loginComo(app, docenteDelCurso);

    const res = await agent.delete(`/api/mensajes-foro/${mensaje._id}`);
    expect(res.status).toBe(403);
  });

  it('un docente no puede moderar mensajes de cursos donde no es el docente', async () => {
    const { padre, foro } = await foroConPadreParticipante();
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: padre._id });
    const docenteAjeno = await crearDocente();
    const agent = await loginComo(app, docenteAjeno);

    const res = await agent.delete(`/api/mensajes-foro/${mensaje._id}`);
    expect(res.status).toBe(403);
  });
});
