import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import crearApp from '../../src/app.js';
import PerfilFamiliar from '../../src/models/PerfilFamiliar.js';
import { crearPadre, crearPerfilFamiliar } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const decodificarAccessToken = (res) => {
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('access_token='));
  const valor = cookie.split(';')[0].split('=')[1];
  return jwt.decode(decodeURIComponent(valor));
};

describe('POST /api/perfiles — crear perfil familiar', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el titular crea un perfil para un miembro de la familia', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/perfiles').send({ nombre: 'Hijo Mayor' });
    expect(res.status).toBe(201);
    expect(res.body.perfil.titularId.toString()).toBe(padre._id.toString());
  });

  it('rechaza un sexto perfil (máximo 5 por cuenta)', async () => {
    const padre = await crearPadre();
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await crearPerfilFamiliar({ titularId: padre._id, nombre: `Hijo ${i}` });
    }
    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/perfiles').send({ nombre: 'Hijo 6' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/perfiles — mis perfiles', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('devuelve al titular primero y luego los perfiles activos', async () => {
    const padre = await crearPadre();
    await crearPerfilFamiliar({ titularId: padre._id, nombre: 'Activo', activo: true });
    await crearPerfilFamiliar({ titularId: padre._id, nombre: 'Inactivo', activo: false });
    const agent = await loginComo(app, padre);

    const res = await agent.get('/api/perfiles');
    expect(res.status).toBe(200);
    expect(res.body.titular.esTitular).toBe(true);
    expect(res.body.perfiles).toHaveLength(1);
    expect(res.body.perfiles[0].nombre).toBe('Activo');
  });

  it('un titular no ve los perfiles de otra cuenta', async () => {
    const padreA = await crearPadre();
    const padreB = await crearPadre();
    await crearPerfilFamiliar({ titularId: padreB._id, nombre: 'De otra familia' });
    const agent = await loginComo(app, padreA);

    const res = await agent.get('/api/perfiles');
    expect(res.body.perfiles).toHaveLength(0);
  });
});

describe('POST /api/perfiles/seleccionar — cambia de perfil activo', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('seleccionar un perfil familiar emite un access token con perfilId y esTitular=false', async () => {
    const padre = await crearPadre();
    const perfil = await crearPerfilFamiliar({ titularId: padre._id, nombre: 'Hijo' });
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/perfiles/seleccionar').send({ perfilId: perfil._id.toString() });
    expect(res.status).toBe(200);

    const payload = decodificarAccessToken(res);
    expect(payload.perfilId).toBe(perfil._id.toString());
    expect(payload.esTitular).toBe(false);
  });

  it('seleccionar "titular" vuelve a emitir un token con esTitular=true y perfilId null', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/perfiles/seleccionar').send({ perfilId: 'titular' });
    const payload = decodificarAccessToken(res);
    expect(payload.esTitular).toBe(true);
    expect(payload.perfilId).toBeNull();
  });

  it('no permite seleccionar un perfil de otra cuenta', async () => {
    const padreA = await crearPadre();
    const padreB = await crearPadre();
    const perfilDeB = await crearPerfilFamiliar({ titularId: padreB._id });
    const agent = await loginComo(app, padreA);

    const res = await agent.post('/api/perfiles/seleccionar').send({ perfilId: perfilDeB._id.toString() });
    expect(res.status).toBe(404);
  });
});

describe('PUT/DELETE de perfiles familiares', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el titular edita su perfil familiar', async () => {
    const padre = await crearPadre();
    const perfil = await crearPerfilFamiliar({ titularId: padre._id, nombre: 'Original' });
    const agent = await loginComo(app, padre);

    const res = await agent.put(`/api/perfiles/${perfil._id}`).send({ nombre: 'Editado' });
    expect(res.status).toBe(200);
    expect(res.body.perfil.nombre).toBe('Editado');
  });

  it('no permite editar el perfil de otra cuenta', async () => {
    const padreA = await crearPadre();
    const padreB = await crearPadre();
    const perfilDeB = await crearPerfilFamiliar({ titularId: padreB._id });
    const agent = await loginComo(app, padreA);

    const res = await agent.put(`/api/perfiles/${perfilDeB._id}`).send({ nombre: 'Hackeado' });
    expect(res.status).toBe(404);
  });

  it('eliminar es un soft delete (activo=false), no borra el documento', async () => {
    const padre = await crearPadre();
    const perfil = await crearPerfilFamiliar({ titularId: padre._id });
    const agent = await loginComo(app, padre);

    const res = await agent.delete(`/api/perfiles/${perfil._id}`);
    expect(res.status).toBe(200);

    const enBD = await PerfilFamiliar.findById(perfil._id);
    expect(enBD).not.toBeNull();
    expect(enBD.activo).toBe(false);
  });
});

describe('POST /api/perfiles/fcm-token', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('guarda el token FCM del perfil activo (no del titular)', async () => {
    const padre = await crearPadre();
    const perfil = await crearPerfilFamiliar({ titularId: padre._id });
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/perfiles/fcm-token').send({ perfilId: perfil._id.toString(), fcmToken: 'token-del-hijo' });
    expect(res.status).toBe(200);

    const enBD = await PerfilFamiliar.findById(perfil._id);
    expect(enBD.fcmToken).toBe('token-del-hijo');
  });

  it('guarda el token FCM del titular si no se especifica perfilId', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/perfiles/fcm-token').send({ fcmToken: 'token-del-titular' });
    expect(res.status).toBe(200);

    const User = (await import('../../src/models/User.js')).default;
    const enBD = await User.findById(padre._id);
    expect(enBD.fcmToken).toBe('token-del-titular');
  });
});
