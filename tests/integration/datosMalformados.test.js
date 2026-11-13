import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import { crearPadre, crearDocente, crearSuperadmin, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

// Datos malformados (ids que no son ObjectId, objetos donde va un texto)
// deben responder 400, nunca 500.
describe('datos malformados responden 400, no 500', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
  });

  const RUTAS_CON_ID = [
    ['get', '/api/tareas/abc'],
    ['put', '/api/tareas/abc'],
    ['patch', '/api/tareas/abc/close'],
    ['delete', '/api/tareas/abc'],
    ['get', '/api/entregas/abc'],
    ['put', '/api/entregas/abc'],
    ['patch', '/api/entregas/abc/enviar'],
    ['patch', '/api/entregas/abc/calificar'],
    ['delete', '/api/entregas/abc'],
    ['delete', '/api/entregas/abc/archivos/abc'],
  ];

  it('rutas de retos y entregas con un :id inválido', async () => {
    const institucion = await crearInstitucion();
    for (const usuario of [await crearDocente({ institucionId: institucion._id }), await crearPadre()]) {
      const agente = await loginComo(app, usuario);
      for (const [metodo, url] of RUTAS_CON_ID) {
        const res = await agente[metodo](url).send({ valoracion: 3 });
        expect(res.status, `${metodo.toUpperCase()} ${url} (${usuario.rol})`).toBe(400);
      }
    }
  });

  it('PUT /api/apk/:id con un :id inválido', async () => {
    const res = await (await loginComo(app, await crearSuperadmin())).put('/api/apk/abc').send({ notas: 'x' });
    expect(res.status).toBe(400);
  });

  it('login con la contraseña como objeto', async () => {
    const padre = await crearPadre();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefono: padre.telefono, contraseña: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('crear entrega con tareaId como objeto', async () => {
    const padre = await crearPadre();
    const res = await (await loginComo(app, padre))
      .post('/api/entregas')
      .send({ tareaId: { $ne: null }, padreId: String(padre._id) });
    expect(res.status).toBe(400);
  });
});
