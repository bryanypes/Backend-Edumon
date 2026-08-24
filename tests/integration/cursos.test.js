import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import crearApp from '../../src/app.js';
import Curso from '../../src/models/Curso.js';
import { crearCurso, crearDocente, crearAdministrador, crearInstitucion, crearPadre } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const FIXTURES = path.resolve(__dirname, '../fixtures');

describe('POST /api/cursos', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un administrador crea un curso para un docente de su institución', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const docente = await crearDocente({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/cursos')
      .field('nombre', 'Matemáticas 5A')
      .field('descripcion', 'Curso de matemáticas para quinto grado')
      .field('docenteId', docente._id.toString());

    expect(res.status).toBe(201);
    expect(res.body.curso.docente.id.toString()).toBe(docente._id.toString());
  });

  it('un padre no puede crear cursos', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/cursos').field('nombre', 'X').field('descripcion', 'Descripción válida').field('docenteId', '507f1f77bcf86cd799439011');
    expect(res.status).toBe(403);
  });

  it('responde 400 si docenteId no corresponde a un usuario docente', async () => {
    const admin = await crearAdministrador();
    const otroAdmin = await crearAdministrador();
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/cursos')
      .field('nombre', 'Curso X')
      .field('descripcion', 'Descripción válida de curso')
      .field('docenteId', otroAdmin._id.toString());

    expect(res.status).toBe(400);
  });

  it('sube la foto de portada a Cloudinary cuando se adjunta una imagen', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const docente = await crearDocente({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/cursos')
      .field('nombre', 'Curso con foto')
      .field('descripcion', 'Descripción válida de curso')
      .field('docenteId', docente._id.toString())
      .attach('fotoPortada', path.join(FIXTURES, 'mini.jpg'));

    expect(res.status).toBe(201);
    expect(res.body.curso.fotoPortadaUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  });

  it('carga participantes por CSV al crear el curso', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const docente = await crearDocente({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/cursos')
      .field('nombre', 'Curso con CSV')
      .field('descripcion', 'Descripción válida de curso')
      .field('docenteId', docente._id.toString())
      .attach('archivoCSV', path.join(FIXTURES, 'participantes.csv'));

    expect(res.status).toBe(201);
    expect(res.body.cargaMasiva.resumen.exitosos).toBe(2);

    const curso = await Curso.findById(res.body.curso._id);
    expect(curso.participantes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/cursos — aislamiento por institución', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('CRÍTICO: un administrador solo ve los cursos de su propia institución', async () => {
    const institucionA = await crearInstitucion();
    const institucionB = await crearInstitucion();
    await crearCurso({ institucionId: institucionA._id });
    await crearCurso({ institucionId: institucionB._id });

    const adminA = await crearAdministrador({ institucionId: institucionA._id });
    const agent = await loginComo(app, adminA);

    const res = await agent.get('/api/cursos');
    expect(res.status).toBe(200);
    expect(res.body.cursos.every((c) => c.institucionId.toString() === institucionA._id.toString())).toBe(true);
  });
});

describe('GET /api/cursos/mis-cursos', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un padre solo ve los cursos donde participa', async () => {
    const padre = await crearPadre();
    const cursoSuyo = await crearCurso();
    cursoSuyo.agregarParticipante(padre._id, 'padre');
    await cursoSuyo.save();
    await crearCurso(); // curso ajeno

    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/cursos/mis-cursos');

    expect(res.status).toBe(200);
    expect(res.body.cursos).toHaveLength(1);
    expect(res.body.cursos[0]._id.toString()).toBe(cursoSuyo._id.toString());
  });
});

describe('PUT /api/cursos/:id y DELETE (archivar)', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente dueño puede editar su curso', async () => {
    const curso = await crearCurso();
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.put(`/api/cursos/${curso._id}`).field('nombre', 'Nombre editado');
    expect(res.status).toBe(200);
    expect(res.body.curso.nombre).toBe('Nombre editado');
  });

  it('un docente NO puede editar el curso de otro docente', async () => {
    const curso = await crearCurso();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.put(`/api/cursos/${curso._id}`).field('nombre', 'Hackeado');
    expect(res.status).toBe(403);
  });

  it('archivar cambia el estado a "archivado" (soft delete)', async () => {
    const curso = await crearCurso();
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.delete(`/api/cursos/${curso._id}`);
    expect(res.status).toBe(200);
    expect((await Curso.findById(curso._id)).estado).toBe('archivado');
  });

  it('archivar dos veces responde 400 la segunda vez', async () => {
    const curso = await crearCurso({ estado: 'archivado' });
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.delete(`/api/cursos/${curso._id}`);
    expect(res.status).toBe(400);
  });

  it('el docente dueño restaura un curso archivado', async () => {
    const curso = await crearCurso({ estado: 'archivado' });
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/cursos/${curso._id}/restaurar`);
    expect(res.status).toBe(200);
    expect((await Curso.findById(curso._id)).estado).toBe('activo');
  });

  it('un administrador de la misma institución también puede restaurar', async () => {
    const curso = await crearCurso({ estado: 'archivado' });
    const admin = await crearAdministrador({ institucionId: curso.institucionId });
    const agent = await loginComo(app, admin);

    const res = await agent.patch(`/api/cursos/${curso._id}/restaurar`);
    expect(res.status).toBe(200);
  });

  it('un administrador de otra institución NO puede restaurar', async () => {
    const curso = await crearCurso({ estado: 'archivado' });
    const adminAjeno = await crearAdministrador();
    const agent = await loginComo(app, adminAjeno);

    const res = await agent.patch(`/api/cursos/${curso._id}/restaurar`);
    expect(res.status).toBe(403);
  });

  it('un docente ajeno no puede restaurar el curso de otro', async () => {
    const curso = await crearCurso({ estado: 'archivado' });
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.patch(`/api/cursos/${curso._id}/restaurar`);
    expect(res.status).toBe(403);
  });

  it('restaurar un curso ya activo responde 400', async () => {
    const curso = await crearCurso({ estado: 'activo' });
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/cursos/${curso._id}/restaurar`);
    expect(res.status).toBe(400);
  });
});

describe('Participantes de un curso', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('agrega un participante nuevo (crea el usuario si no existe)', async () => {
    const curso = await crearCurso();
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.post(`/api/cursos/${curso._id}/participantes`).send({
      nombre: 'Nuevo', apellido: 'Participante', telefono: '3009998877', cedula: '99887766',
    });

    expect(res.status).toBe(200);
    const actualizado = await Curso.findById(curso._id);
    expect(actualizado.participantes.length).toBeGreaterThan(1);
  });

  it('no permite remover al docente principal del curso', async () => {
    const curso = await crearCurso();
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.delete(`/api/cursos/${curso._id}/participantes/${docente._id}`);
    expect(res.status).toBe(400);
  });

  it('un padre no puede ver el listado de participantes (reservado a admin/docente)', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();
    const agent = await loginComo(app, padre);

    const res = await agent.get(`/api/cursos/${curso._id}/participantes`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/cursos/:id/usuarios-masivo — carga CSV en un curso existente', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente dueño carga participantes por CSV', async () => {
    const curso = await crearCurso();
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.post(`/api/cursos/${curso._id}/usuarios-masivo`)
      .attach('archivoCSV', path.join(FIXTURES, 'participantes.csv'));

    expect(res.status).toBe(200);
    expect(res.body.resumen.exitosos).toBe(2);
  });

  it('un docente ajeno no puede cargar usuarios en un curso que no es suyo', async () => {
    const curso = await crearCurso();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.post(`/api/cursos/${curso._id}/usuarios-masivo`)
      .attach('archivoCSV', path.join(FIXTURES, 'participantes.csv'));
    expect(res.status).toBe(403);
  });

  it('responde 400 si no se adjunta ningún archivo', async () => {
    const curso = await crearCurso();
    const docente = await import('../../src/models/User.js').then((m) => m.default.findById(curso.docenteId));
    const agent = await loginComo(app, docente);

    const res = await agent.post(`/api/cursos/${curso._id}/usuarios-masivo`);
    expect(res.status).toBe(400);
  });
});
