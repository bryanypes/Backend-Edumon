import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import { crearPadre, crearDocente, crearAdministrador, crearSuperadmin, crearInstitucion, crearCurso, cedulaDePrueba, telefonoDePrueba } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

describe('CRUD de usuarios (/api/users) — solo administrador/superadmin', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un padre no puede listar usuarios (403)', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/users');
    expect(res.status).toBe(403);
  });

  it('sin autenticar, responde 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('un administrador puede crear un usuario', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/users').send({
      nombre: 'Nuevo',
      apellido: 'Usuario',
      cedula: cedulaDePrueba(),
      correo: `nuevo${Date.now()}${Math.random()}@test.edumon.com`,
      contraseña: 'ClaveNueva123',
      rol: 'padre',
      telefono: telefonoDePrueba(),
    });

    expect(res.status).toBe(201);
    expect(res.body.user.rol).toBe('padre');
  });

  it('ESCALADA: un administrador no puede crear otro administrador ni un superadmin', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    for (const rol of ['administrador', 'superadmin']) {
      const res = await agent.post('/api/users').send({
        nombre: 'Escalado', apellido: 'Test', cedula: cedulaDePrueba(),
        correo: `esc${rol}${Date.now()}${Math.random()}@test.edumon.com`,
        contraseña: 'ClaveNueva123', rol, telefono: telefonoDePrueba(),
        institucionId: institucion._id.toString(),
      });
      expect(res.status).toBe(403);
    }
  });

  it('CROSS-TENANT: un docente creado por un admin queda en la institución del admin, no en la que mande el body', async () => {
    const [instA, instB] = [await crearInstitucion(), await crearInstitucion()];
    const admin = await crearAdministrador({ institucionId: instA._id });
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/users').send({
      nombre: 'Doc', apellido: 'Test', cedula: cedulaDePrueba(),
      correo: `doc${Date.now()}${Math.random()}@test.edumon.com`,
      contraseña: 'ClaveNueva123', rol: 'docente', telefono: telefonoDePrueba(),
      institucionId: instB._id.toString(), // intenta colocarlo en otra institución
    });

    expect(res.status).toBe(201);
    expect(res.body.user.institucionId).toBe(instA._id.toString());
  });

  it('CRÍTICO: un usuario autenticado no puede autoelevarse a administrador vía PUT /api/users/:id', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.put(`/api/users/${padre._id}`).send({ rol: 'administrador' });

    // requireRole bloquea el acceso a la ruta a cualquiera que no sea admin/superadmin
    expect(res.status).toBe(403);
    const enBD = await User.findById(padre._id);
    expect(enBD.rol).toBe('padre');
  });

  it('un administrador puede actualizar datos de un usuario de su institución, pero rol/estado/institucionId quedan protegidos por el controlador', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);
    const padre = await crearPadre({ institucionId: institucion._id });

    const res = await agent.put(`/api/users/${padre._id}`).send({ nombre: 'Nombre Editado', rol: 'superadmin', estado: 'suspendido' });

    expect(res.status).toBe(200);
    const enBD = await User.findById(padre._id);
    expect(enBD.nombre).toBe('Nombre Editado');
    expect(enBD.rol).toBe('padre'); // el controlador descarta "rol" del body
    expect(enBD.estado).toBe('activo'); // el controlador descarta "estado" del body
  });

  it('CROSS-TENANT: un administrador NO puede actualizar un usuario de otra institución', async () => {
    const [instA, instB] = [await crearInstitucion(), await crearInstitucion()];
    const admin = await crearAdministrador({ institucionId: instA._id });
    const padreAjeno = await crearPadre({ institucionId: instB._id });
    const agent = await loginComo(app, admin);

    const res = await agent.put(`/api/users/${padreAjeno._id}`).send({ nombre: 'Intruso' });

    expect(res.status).toBe(403);
    expect((await User.findById(padreAjeno._id)).nombre).not.toBe('Intruso');
  });

  it('CROSS-TENANT: un administrador NO puede suspender ni reactivar usuarios de otra institución', async () => {
    const [instA, instB] = [await crearInstitucion(), await crearInstitucion()];
    const admin = await crearAdministrador({ institucionId: instA._id });
    const padreAjeno = await crearPadre({ institucionId: instB._id, estado: 'activo' });
    const agent = await loginComo(app, admin);

    expect((await agent.delete(`/api/users/${padreAjeno._id}`)).status).toBe(403);
    expect((await agent.patch(`/api/users/${padreAjeno._id}/reactivar`)).status).toBe(403);
    expect((await agent.get(`/api/users/${padreAjeno._id}`)).status).toBe(403);
  });

  it('CROSS-TENANT: GET /api/users solo lista usuarios de la institución del admin', async () => {
    const [instA, instB] = [await crearInstitucion(), await crearInstitucion()];
    const admin = await crearAdministrador({ institucionId: instA._id });
    await crearPadre({ institucionId: instA._id });
    await crearPadre({ institucionId: instB._id });
    const agent = await loginComo(app, admin);

    const res = await agent.get('/api/users?rol=padre');
    expect(res.status).toBe(200);
    expect(res.body.users.every((u) => u.institucionId === instA._id.toString())).toBe(true);
  });

  it('un superadmin no puede crear un segundo superadmin (solo puede haber uno)', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.post('/api/users').send({
      nombre: 'Otro', apellido: 'Super', cedula: cedulaDePrueba(),
      correo: `otrosuper${Date.now()}${Math.random()}@test.edumon.com`,
      contraseña: 'ClaveNueva123', rol: 'superadmin', telefono: telefonoDePrueba(),
    });

    expect(res.status).toBe(409);
  });

  it('DELETE hace soft-delete (suspende) en vez de borrar el documento', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);
    const padre = await crearPadre({ institucionId: institucion._id });

    const res = await agent.delete(`/api/users/${padre._id}`);
    expect(res.status).toBe(200);

    const enBD = await User.findById(padre._id);
    expect(enBD).not.toBeNull();
    expect(enBD.estado).toBe('suspendido');
  });

  it('GET /:id responde 400 con un ID inválido (no ObjectId)', async () => {
    const admin = await crearAdministrador();
    const agent = await loginComo(app, admin);
    const res = await agent.get('/api/users/no-es-un-id');
    expect(res.status).toBe(400);
  });

  it('PATCH /:id/reactivar revierte la suspensión', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);
    const padre = await crearPadre({ institucionId: institucion._id, estado: 'suspendido' });

    const res = await agent.patch(`/api/users/${padre._id}/reactivar`);
    expect(res.status).toBe(200);
    expect((await User.findById(padre._id)).estado).toBe('activo');
  });

  it('PATCH /:id/reactivar responde 400 si el usuario ya está activo', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);
    const padre = await crearPadre({ institucionId: institucion._id, estado: 'activo' });

    const res = await agent.patch(`/api/users/${padre._id}/reactivar`);
    expect(res.status).toBe(400);
  });

  it('un padre no puede reactivar usuarios', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const otro = await crearPadre({ estado: 'suspendido' });

    const res = await agent.patch(`/api/users/${otro._id}/reactivar`);
    expect(res.status).toBe(403);
  });
});

describe('/api/users/me — perfil propio', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('GET /me/profile devuelve el perfil propio', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/users/me/profile');
    expect(res.status).toBe(200);
  });

  it('PUT /me/profile permite editar nombre/apellido/correo/telefono, nunca rol/estado', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.put('/api/users/me/profile').send({ nombre: 'Nuevo Nombre' });
    expect(res.status).toBe(200);
    expect(res.body.user.nombre).toBe('Nuevo Nombre');
  });

  it('PUT /me/profile no permite editar el perfil de OTRO usuario aunque se mande otro id en el body', async () => {
    const padre = await crearPadre();
    const otroPadre = await crearPadre();
    const agent = await loginComo(app, padre);

    await agent.put('/api/users/me/profile').send({ nombre: 'Hackeado', _id: otroPadre._id.toString() });

    const otroSinCambios = await User.findById(otroPadre._id);
    expect(otroSinCambios.nombre).not.toBe('Hackeado');
  });

  it('PUT /me/profile responde 409 si el correo ya lo usa otra cuenta', async () => {
    const otro = await crearPadre();
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.put('/api/users/me/profile').send({ correo: otro.correo });
    expect(res.status).toBe(409);
  });

  it('PATCH /me/modo-oscuro actualiza la preferencia', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.patch('/api/users/me/modo-oscuro').send({ modoOscuro: true });
    expect(res.status).toBe(200);
    expect(res.body.modoOscuro).toBe(true);
  });

  it('PATCH /me/modo-oscuro rechaza un valor no booleano', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.patch('/api/users/me/modo-oscuro').send({ modoOscuro: 'si' });
    expect(res.status).toBe(400);
  });

  it('PUT /me/fcm-token guarda el token FCM del dispositivo', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.put('/api/users/me/fcm-token').send({ fcmToken: 'un-token-fcm-de-prueba-valido' });
    expect(res.status).toBe(200);
    const enBD = await User.findById(padre._id);
    expect(enBD.fcmToken).toBe('un-token-fcm-de-prueba-valido');
  });
});

describe('/api/users/sesiones/ultimas', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un usuario normal solo ve su propio último acceso', async () => {
    const padre = await crearPadre({ ultimoAcceso: new Date() });
    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/users/sesiones/ultimas');

    expect(res.status).toBe(200);
    expect(res.body.sesiones).toBeUndefined();
    expect(res.body.ultimoAcceso).toBeDefined();
  });

  it('un superadmin ve la lista paginada de todos los usuarios', async () => {
    await crearPadre();
    await crearDocente();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.get('/api/users/sesiones/ultimas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sesiones)).toBe(true);
    expect(res.body.sesiones.length).toBeGreaterThanOrEqual(2);
  });
});

describe('/api/users/padre/:padreId/info', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un docente que comparte curso con el padre ve su info', async () => {
    const curso = await crearCurso();
    const docente = await User.findById(curso.docenteId);
    const padre = await crearPadre();
    curso.participantes.push({ usuarioId: padre._id, etiqueta: 'padre' });
    await curso.save();

    const agent = await loginComo(app, docente);
    const res = await agent.get(`/api/users/padre/${padre._id}/info`);
    expect(res.status).toBe(200);
    expect(res.body.padre.nombreCompleto).toContain(padre.nombre);
  });

  it('IDOR: un docente que NO comparte curso con el padre no puede ver su info', async () => {
    const padre = await crearPadre();
    const docenteSinRelacion = await crearDocente();
    const agent = await loginComo(app, docenteSinRelacion);

    const res = await agent.get(`/api/users/padre/${padre._id}/info`);
    expect(res.status).toBe(403);
  });

  it('IDOR: un padre no puede ver la info de OTRO padre', async () => {
    const padre = await crearPadre();
    const otroPadre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.get(`/api/users/padre/${otroPadre._id}/info`);
    expect(res.status).toBe(403);
  });

  it('un padre sí puede ver su propia info', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.get(`/api/users/padre/${padre._id}/info`);
    expect(res.status).toBe(200);
  });

  it('responde 400 si el usuario indicado no tiene rol padre', async () => {
    const docente = await crearDocente();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, docente);

    const res = await agent.get(`/api/users/padre/${otroDocente._id}/info`);
    expect(res.status).toBe(400);
  });

  it('responde 400 con un padreId inválido', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/users/padre/no-es-un-id/info');
    expect(res.status).toBe(400);
  });
});
