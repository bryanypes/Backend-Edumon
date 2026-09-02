import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import Apk from '../../src/models/Apk.js';
import { crearSuperadmin, crearAdministrador, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const apkFalso = () => Buffer.from('PK fake apk payload');

describe('GET /api/apk/actual (público)', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('responde 404 si todavía no se ha subido ninguna versión', async () => {
    const res = await request(app).get('/api/apk/actual');
    expect(res.status).toBe(404);
  });

  it('devuelve la versión activa sin necesidad de autenticación', async () => {
    await Apk.create({ version: '1.0.0', url: 'https://cdn/x.apk', publicId: 'apks/x', tamano: 123, activa: true });
    const res = await request(app).get('/api/apk/actual');
    expect(res.status).toBe(200);
    expect(res.body.apk.version).toBe('1.0.0');
    expect(res.body.apk.url).toBe('https://cdn/x.apk');
  });
});

describe('POST /api/apk — subir APK', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el superadmin sube un APK y recibe el enlace de descarga', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.post('/api/apk')
      .field('version', '1.4.2')
      .field('versionCode', '142')
      .field('notas', 'Arreglos varios')
      .attach('apk', apkFalso(), { filename: 'edumon.apk', contentType: 'application/vnd.android.package-archive' });

    expect(res.status).toBe(201);
    expect(res.body.apk.version).toBe('1.4.2');
    expect(res.body.apk.versionCode).toBe(142);
    expect(res.body.apk.url).toBeTruthy();
    expect(res.body.apk.urlDescarga).toContain('fl_attachment');
    expect(res.body.apk.activa).toBe(true);
  });

  it('un administrador no puede subir APKs (403)', async () => {
    const admin = await crearAdministrador({ institucionId: (await crearInstitucion())._id });
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/apk')
      .field('version', '1.0.0')
      .attach('apk', apkFalso(), { filename: 'edumon.apk' });

    expect(res.status).toBe(403);
  });

  it('rechaza si no se adjunta el archivo', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);
    const res = await agent.post('/api/apk').field('version', '1.0.0');
    expect(res.status).toBe(400);
  });

  it('rechaza si falta la versión', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);
    const res = await agent.post('/api/apk')
      .attach('apk', apkFalso(), { filename: 'edumon.apk' });
    expect(res.status).toBe(400);
  });

  it('rechaza un archivo que no es .apk', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);
    const res = await agent.post('/api/apk')
      .field('version', '1.0.0')
      .attach('apk', apkFalso(), { filename: 'virus.exe' });
    expect(res.status).toBe(400);
  });

  it('subir una versión nueva desactiva la anterior (solo una activa)', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    await agent.post('/api/apk').field('version', '1.0.0')
      .attach('apk', apkFalso(), { filename: 'v1.apk' });
    await agent.post('/api/apk').field('version', '2.0.0')
      .attach('apk', apkFalso(), { filename: 'v2.apk' });

    const activas = await Apk.find({ activa: true });
    expect(activas).toHaveLength(1);
    expect(activas[0].version).toBe('2.0.0');

    const actual = await request(app).get('/api/apk/actual');
    expect(actual.body.apk.version).toBe('2.0.0');
  });
});

describe('PUT / DELETE /api/apk/:id', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el superadmin edita las notas de una versión', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);
    const apk = await Apk.create({ version: '1.0.0', url: 'https://cdn/x.apk', publicId: 'apks/x', tamano: 1, activa: true });

    const res = await agent.put(`/api/apk/${apk._id}`).send({ notas: 'Notas nuevas', obligatoria: true });
    expect(res.status).toBe(200);
    expect(res.body.apk.notas).toBe('Notas nuevas');
    expect(res.body.apk.obligatoria).toBe(true);
  });

  it('reactivar una versión antigua desactiva las demás', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);
    const vieja = await Apk.create({ version: '1.0.0', url: 'https://cdn/v1.apk', publicId: 'apks/v1', tamano: 1, activa: false });
    await Apk.create({ version: '2.0.0', url: 'https://cdn/v2.apk', publicId: 'apks/v2', tamano: 1, activa: true });

    await agent.put(`/api/apk/${vieja._id}`).send({ activa: true });

    const activas = await Apk.find({ activa: true });
    expect(activas).toHaveLength(1);
    expect(activas[0].version).toBe('1.0.0');
  });

  it('el superadmin elimina una versión y se promueve la siguiente como activa', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);
    await Apk.create({ version: '1.0.0', url: 'https://cdn/v1.apk', publicId: 'apks/v1', tamano: 1, activa: false });
    const activa = await Apk.create({ version: '2.0.0', url: 'https://cdn/v2.apk', publicId: 'apks/v2', tamano: 1, activa: true });

    const res = await agent.delete(`/api/apk/${activa._id}`);
    expect(res.status).toBe(200);

    const restantes = await Apk.find();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].activa).toBe(true);
  });

  it('un administrador no puede eliminar APKs (403)', async () => {
    const admin = await crearAdministrador({ institucionId: (await crearInstitucion())._id });
    const agent = await loginComo(app, admin);
    const apk = await Apk.create({ version: '1.0.0', url: 'https://cdn/x.apk', publicId: 'apks/x', tamano: 1, activa: true });

    const res = await agent.delete(`/api/apk/${apk._id}`);
    expect(res.status).toBe(403);
  });
});
