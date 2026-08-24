import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Institucion from '../../src/models/Institucion.js';
import User from '../../src/models/User.js';
import { crearAdministrador, crearSuperadmin, crearInstitucion, crearDocente, cedulaDePrueba, telefonoDePrueba } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

describe('POST /api/instituciones — solo superadmin', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un administrador no puede crear instituciones', async () => {
    const admin = await crearAdministrador();
    const agent = await loginComo(app, admin);
    const res = await agent.post('/api/instituciones').send({ nombre: 'Colegio X', nit: '900123' });
    expect(res.status).toBe(403);
  });

  it('un superadmin crea la institución y su administrador (contraseña inicial = cédula)', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const adminCedula = cedulaDePrueba();
    const res = await agent.post('/api/instituciones').send({
      nombre: 'Colegio Nuevo',
      nit: `NIT-${Date.now()}`,
      adminNombre: 'Carlos',
      adminApellido: 'Pérez',
      adminCedula,
      adminTelefono: telefonoDePrueba(),
    });

    expect(res.status).toBe(201);
    expect(res.body.institucion.codigo).toMatch(/^EDU-/);

    const admin = await User.findOne({ cedula: adminCedula });
    expect(admin.rol).toBe('administrador');
    expect(await admin.comparePassword(admin.cedula)).toBe(true);
  });

  it('responde 400 si el NIT ya existe', async () => {
    const institucionExistente = await crearInstitucion();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.post('/api/instituciones').send({
      nombre: 'Otra', nit: institucionExistente.nit,
      adminNombre: 'A', adminApellido: 'B', adminCedula: cedulaDePrueba(),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/instituciones — solo superadmin', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un docente no puede listar instituciones', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/instituciones');
    expect(res.status).toBe(403);
  });

  it('el superadmin ve todas las instituciones activas', async () => {
    await crearInstitucion();
    await crearInstitucion();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.get('/api/instituciones');
    expect(res.status).toBe(200);
    expect(res.body.instituciones.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/instituciones/mi-institucion', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un administrador ve los datos de su propia institución', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.get('/api/instituciones/mi-institucion');
    expect(res.status).toBe(200);
    expect(res.body.institucion._id.toString()).toBe(institucion._id.toString());
  });

  it('responde 404 si el administrador no tiene institución asignada', async () => {
    const admin = await crearAdministrador({ institucionId: null });
    const agent = await loginComo(app, admin);
    const res = await agent.get('/api/instituciones/mi-institucion');
    expect(res.status).toBe(404);
  });

  it('un docente no puede acceder a este endpoint (reservado a admin/superadmin)', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/instituciones/mi-institucion');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/instituciones/docentes — preregistro individual', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el administrador preregistra un docente con contraseña = cédula', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const cedula = cedulaDePrueba();
    const res = await agent.post('/api/instituciones/docentes').send({
      nombre: 'Prof', apellido: 'Nuevo', cedula, telefono: telefonoDePrueba(),
    });

    expect(res.status).toBe(201);
    const docente = await User.findOne({ cedula });
    expect(docente.rol).toBe('docente');
    expect(docente.institucionId.toString()).toBe(institucion._id.toString());
    expect(await docente.comparePassword(cedula)).toBe(true);
  });

  it('un superadmin no puede usar esta ruta de preregistro (reservada a "administrador")', async () => {
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);
    const res = await agent.post('/api/instituciones/docentes').send({ nombre: 'X', apellido: 'Y', cedula: cedulaDePrueba() });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/instituciones/:id', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el superadmin puede actualizar los datos generales de una institución', async () => {
    const institucion = await crearInstitucion();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.put(`/api/instituciones/${institucion._id}`).send({ nombre: 'Nombre Actualizado' });
    expect(res.status).toBe(200);
    expect(res.body.institucion.nombre).toBe('Nombre Actualizado');
  });

  it('un administrador no puede actualizar instituciones (reservado a superadmin)', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.put(`/api/instituciones/${institucion._id}`).send({ nombre: 'Hackeado' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/instituciones/:id/estado', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el superadmin desactiva una institución', async () => {
    const institucion = await crearInstitucion();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.patch(`/api/instituciones/${institucion._id}/estado`).send({ activo: false });
    expect(res.status).toBe(200);
    expect((await Institucion.findById(institucion._id)).activo).toBe(false);
  });

  it('una institución desactivada ya no aparece en el listado del superadmin', async () => {
    const institucion = await crearInstitucion();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    await agent.patch(`/api/instituciones/${institucion._id}/estado`).send({ activo: false });
    const lista = await agent.get('/api/instituciones');

    expect(lista.body.instituciones.map((i) => i._id)).not.toContain(institucion._id.toString());
  });

  it('el superadmin puede reactivarla de nuevo', async () => {
    const institucion = await crearInstitucion({ activo: false });
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.patch(`/api/instituciones/${institucion._id}/estado`).send({ activo: true });
    expect(res.status).toBe(200);
    expect((await Institucion.findById(institucion._id)).activo).toBe(true);
  });

  it('un administrador no puede cambiar el estado de su institución', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.patch(`/api/instituciones/${institucion._id}/estado`).send({ activo: false });
    expect(res.status).toBe(403);
  });

  it('rechaza un valor no booleano', async () => {
    const institucion = await crearInstitucion();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const res = await agent.patch(`/api/instituciones/${institucion._id}/estado`).send({ activo: 'si' });
    expect(res.status).toBe(400);
  });
});
