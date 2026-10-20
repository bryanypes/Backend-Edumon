import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import ConsentimientoIA from '../../src/models/ConsentimientoIA.js';
import ConversacionIA from '../../src/models/ConversacionIA.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { crearPadre, crearDocente, crearPerfilFamiliar } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

describe('Consentimiento de Edumon (IA)', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un padre sin consentimiento lo ve como no aceptado con la versión vigente', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.get('/api/ia/consentimiento');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ versionVigente: VERSION_CONSENTIMIENTO, aceptado: false });
  });

  it('acepta la versión vigente y queda registrado', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    expect(res.status).toBe(201);

    const estado = await agent.get('/api/ia/consentimiento');
    expect(estado.body.aceptado).toBe(true);
    expect(await ConsentimientoIA.countDocuments({ usuarioId: padre._id })).toBe(1);
  });

  it('aceptar dos veces no duplica el registro', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    const res = await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    expect(res.status).toBe(200);
    expect(await ConsentimientoIA.countDocuments({ usuarioId: padre._id })).toBe(1);
  });

  it('rechaza con 409 una versión distinta a la vigente', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/ia/consentimiento').send({ version: 'version-vieja' });
    expect(res.status).toBe(409);
    expect(await ConsentimientoIA.countDocuments({ usuarioId: padre._id })).toBe(0);
  });

  it('revocar marca el consentimiento y borra las conversaciones del perfil', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    await ConversacionIA.create({ usuarioId: padre._id });

    const res = await agent.delete('/api/ia/consentimiento');
    expect(res.status).toBe(200);
    expect(res.body.conversacionesEliminadas).toBe(1);

    const estado = await agent.get('/api/ia/consentimiento');
    expect(estado.body.aceptado).toBe(false);
    expect(await ConsentimientoIA.countDocuments({ usuarioId: padre._id, revocadoEn: { $ne: null } })).toBe(1);
  });

  it('cada perfil familiar tiene su propio consentimiento', async () => {
    const padre = await crearPadre();
    const perfil = await crearPerfilFamiliar({ titularId: padre._id, nombre: 'Abuela' });
    const agent = await loginComo(app, padre);
    await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });

    await agent.post('/api/perfiles/seleccionar').send({ perfilId: perfil._id.toString() });
    const res = await agent.get('/api/ia/consentimiento');
    expect(res.body.aceptado).toBe(false);
  });

  it('un docente no puede usar los endpoints de familia', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);

    const res = await agent.get('/api/ia/consentimiento');
    expect(res.status).toBe(403);
  });
});

describe('Conversaciones de Edumon (IA)', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  const padreConConsentimiento = async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    return { padre, agent };
  };

  it('sin consentimiento responde 403 con code CONSENTIMIENTO_REQUERIDO', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.get('/api/ia/conversaciones');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CONSENTIMIENTO_REQUERIDO');
  });

  it('lista solo las conversaciones propias, sin los mensajes', async () => {
    const { padre, agent } = await padreConConsentimiento();
    const otro = await crearPadre();
    await ConversacionIA.create({
      usuarioId: padre._id,
      titulo: 'Pantallas',
      mensajes: [{ rol: 'usuario', contenido: 'mi hijo no suelta el celular' }],
    });
    await ConversacionIA.create({ usuarioId: otro._id, titulo: 'De otra familia' });

    const res = await agent.get('/api/ia/conversaciones');
    expect(res.status).toBe(200);
    expect(res.body.conversaciones).toHaveLength(1);
    expect(res.body.conversaciones[0].titulo).toBe('Pantallas');
    expect(res.body.conversaciones[0].mensajes).toBeUndefined();
  });

  it('el titular no ve las conversaciones de sus perfiles familiares', async () => {
    const { padre, agent } = await padreConConsentimiento();
    const perfil = await crearPerfilFamiliar({ titularId: padre._id });
    await ConversacionIA.create({ usuarioId: padre._id, perfilId: perfil._id, titulo: 'Del perfil' });

    const res = await agent.get('/api/ia/conversaciones');
    expect(res.body.conversaciones).toHaveLength(0);
  });

  it('elimina una conversación propia', async () => {
    const { padre, agent } = await padreConConsentimiento();
    const conversacion = await ConversacionIA.create({ usuarioId: padre._id });

    const res = await agent.delete(`/api/ia/conversaciones/${conversacion._id}`);
    expect(res.status).toBe(200);
    expect(await ConversacionIA.countDocuments()).toBe(0);
  });

  it('no puede eliminar la conversación de otra familia (404)', async () => {
    const { agent } = await padreConConsentimiento();
    const otro = await crearPadre();
    const ajena = await ConversacionIA.create({ usuarioId: otro._id });

    const res = await agent.delete(`/api/ia/conversaciones/${ajena._id}`);
    expect(res.status).toBe(404);
    expect(await ConversacionIA.countDocuments()).toBe(1);
  });
});
