import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import Institucion from '../../src/models/Institucion.js';
import RetroalimentacionIA from '../../src/models/RetroalimentacionIA.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { anonimizarComentario } from '../../src/services/ia/retroalimentacion.js';
import { crearPadre, crearDocente, crearAdministrador, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const familiaCon = async (app, institucion) => {
  const agent = await loginComo(app, await crearPadre({ institucionId: institucion._id }));
  await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
  const { body } = await agent.post('/api/ia/conversaciones');
  const id = body.conversacion._id;
  const r = await agent.post(`/api/ia/conversaciones/${id}/mensajes`).send({ contenido: 'mi hija de 4 años hace rabietas terribles' });
  return { agent, id, respuesta: r.body.respuesta, mensajeUsuario: r.body.mensajeUsuario };
};
const calificar = (f, cuerpo, mensajeId = f.respuesta._id) => f.agent
  .put(`/api/ia/conversaciones/${f.id}/mensajes/${mensajeId}/calificacion`).send(cuerpo);

describe('Retroalimentación de las familias', () => {
  let app;
  let institucion;
  let admin;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
    institucion = await crearInstitucion();
    admin = await crearAdministrador({ institucionId: institucion._id });
    await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
  });

  it('una calificación por mensaje y perfil: volver a calificar la reemplaza', async () => {
    const f = await familiaCon(app, institucion);
    const primera = await calificar(f, { util: true });
    expect(primera.status).toBe(201);
    const segunda = await calificar(f, { util: false, comentario: 'no me sirvió' });
    expect(segunda.status).toBe(200);
    expect(segunda.body.calificacion).toMatchObject({ util: false, comentario: 'no me sirvió' });
    expect(await RetroalimentacionIA.countDocuments()).toBe(1);
    const guardada = await RetroalimentacionIA.findOne().lean();
    expect(guardada).toMatchObject({ tipoRespuesta: 'respuesta', modoIA: 'simulado' });
  });

  it('validaciones: solo respuestas de Edumon, util booleano, mensaje de la conversación', async () => {
    const f = await familiaCon(app, institucion);
    expect((await calificar(f, { util: true }, f.mensajeUsuario._id)).status).toBe(400);
    expect((await calificar(f, { util: 'si' })).status).toBe(400);
    expect((await calificar(f, { util: true, comentario: 'x'.repeat(501) })).status).toBe(400);
    expect((await calificar(f, { util: true }, '64b000000000000000000000')).status).toBe(404);
    expect((await calificar(f, { util: true }, 'no-es-id')).status).toBe(400);
  });

  it('otra familia no puede calificar mensajes ajenos (404); docente 403; sin sesión 401', async () => {
    const f = await familiaCon(app, institucion);
    const otra = await familiaCon(app, institucion);
    const url = `/api/ia/conversaciones/${f.id}/mensajes/${f.respuesta._id}/calificacion`;
    expect((await otra.agent.put(url).send({ util: true })).status).toBe(404);
    expect((await (await loginComo(app, await crearDocente({ institucionId: institucion._id }))).put(url).send({ util: true })).status).toBe(403);
    expect((await request(app).put(url).send({ util: true })).status).toBe(401);
  });

  it('el administrador ve el agregado de su institución, filtrable por sesión de validación', async () => {
    const familias = await Promise.all([1, 2, 3].map(() => familiaCon(app, institucion)));
    await calificar(familias[0], { util: true, sesionValidacion: 'feria-2026-10-21' });
    await calificar(familias[1], { util: true, comentario: 'Muy clara, escríbanme a mama.demo@ejemplo.com o al 3001234567', sesionValidacion: 'feria-2026-10-21' });
    await calificar(familias[2], { util: false, comentario: 'muy larga' });
    // otra institución: no se mezcla
    const ajena = await crearInstitucion();
    await calificar(await familiaCon(app, ajena), { util: false });

    const agent = await loginComo(app, admin);
    const todo = (await agent.get('/api/ia/retroalimentacion')).body;
    expect(todo).toMatchObject({ total: 3, utiles: 2, noUtiles: 1, porcentajeUtil: 66.7, sesionesValidacion: ['feria-2026-10-21'] });
    expect(todo.porModoIA.simulado).toMatchObject({ total: 3, utiles: 2 });
    expect(todo.comentariosRecientes).toHaveLength(2);
    const json = JSON.stringify(todo);
    expect(json).not.toContain('mama.demo@ejemplo.com');
    expect(json).not.toContain('3001234567');
    expect(json).not.toMatch(/usuarioId|perfilId|conversacionId/);

    const feria = (await agent.get('/api/ia/retroalimentacion?sesion=feria-2026-10-21')).body;
    expect(feria).toMatchObject({ total: 2, utiles: 2, porcentajeUtil: 100 });
  });

  it('solo administrador: docente y familia 403', async () => {
    expect((await (await loginComo(app, await crearDocente({ institucionId: institucion._id }))).get('/api/ia/retroalimentacion')).status).toBe(403);
    expect((await (await loginComo(app, await crearPadre())).get('/api/ia/retroalimentacion')).status).toBe(403);
    expect((await request(app).get('/api/ia/retroalimentacion')).status).toBe(401);
  });

  it('anonimiza correos, teléfonos y números largos de los comentarios', () => {
    expect(anonimizarComentario('mi correo es a.b@c.co y mi cel +57 300 123 4567, cédula 1234567890'))
      .toBe('mi correo es [correo] y mi cel [número], cédula [número]');
  });
});
