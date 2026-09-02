import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import crearApp from '../../src/app.js';
import Tarea from '../../src/models/Tarea.js';
import User from '../../src/models/User.js';
import { crearCurso, crearModulo, crearTarea, crearDocente, crearPadre, crearAdministrador } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const FIXTURES = path.resolve(__dirname, '../fixtures');
const docenteDelCurso = (curso) => User.findById(curso.docenteId);
const manana = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe('POST /api/tareas', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente dueño del curso crea una tarea de tipo texto', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/tareas').send({
      titulo: 'Ensayo sobre el agua',
      fechaEntrega: manana(),
      tipoEntrega: 'texto',
      cursoId: curso._id.toString(),
      moduloId: modulo._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.tarea.docenteId._id.toString()).toBe(docente._id.toString());
  });

  it('CORREGIDO: un padre no puede crear tareas (antes no se validaba el rol)', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/tareas').send({
      titulo: 'Intento de padre', fechaEntrega: manana(), tipoEntrega: 'texto',
      cursoId: curso._id.toString(), moduloId: modulo._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('CORREGIDO: un docente no puede crear tareas en cursos ajenos', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.post('/api/tareas').send({
      titulo: 'Intento ajeno', fechaEntrega: manana(), tipoEntrega: 'texto',
      cursoId: curso._id.toString(), moduloId: modulo._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rechaza crear una tarea con un moduloId que pertenece a otro curso', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const otroCurso = await crearCurso();
    const moduloDeOtroCurso = await crearModulo({ cursoId: otroCurso._id });
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/tareas').send({
      titulo: 'Tarea con módulo ajeno', fechaEntrega: manana(), tipoEntrega: 'texto',
      cursoId: curso._id.toString(), moduloId: moduloDeOtroCurso._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('rechaza una fecha de entrega en el pasado', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/tareas').send({
      titulo: 'Tarea vencida', fechaEntrega: new Date(Date.now() - 86400000).toISOString(), tipoEntrega: 'texto',
      cursoId: curso._id.toString(), moduloId: modulo._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('asignacionTipo=seleccionados requiere validar que los participantes pertenezcan al curso', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const padreAjeno = await crearPadre();
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/tareas').send({
      titulo: 'Tarea dirigida', fechaEntrega: manana(), tipoEntrega: 'texto',
      cursoId: curso._id.toString(), moduloId: modulo._id.toString(),
      asignacionTipo: 'seleccionados', participantesSeleccionados: [padreAjeno._id.toString()],
    });
    expect(res.status).toBe(400);
  });

  it('adjunta archivos a Cloudinary al crear la tarea', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/tareas')
      .field('titulo', 'Tarea con adjunto')
      .field('fechaEntrega', manana())
      .field('tipoEntrega', 'archivo')
      .field('cursoId', curso._id.toString())
      .field('moduloId', modulo._id.toString())
      .attach('archivos', path.join(FIXTURES, 'mini.pdf'));

    expect(res.status).toBe(201);
    expect(res.body.tarea.archivosAdjuntos).toHaveLength(1);
    expect(res.body.tarea.archivosAdjuntos[0].url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  });
});

describe('GET /api/tareas — filtrado por rol', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un docente solo ve sus propias tareas', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    await crearTarea({ cursoId: curso._id, moduloId: modulo._id, docenteId: curso.docenteId });
    await crearTarea(); // de otro docente, otro curso

    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/tareas');

    expect(res.status).toBe(200);
    expect(res.body.tareas.every((t) => t.docenteId._id.toString() === docente._id.toString())).toBe(true);
  });

  it('un padre solo ve tareas de cursos donde participa', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();

    const tareaVisible = await crearTarea({ cursoId: curso._id, moduloId: modulo._id, docenteId: curso.docenteId, asignacionTipo: 'todos' });
    await crearTarea(); // de un curso ajeno

    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/tareas');

    expect(res.status).toBe(200);
    expect(res.body.tareas.map((t) => t._id)).toContain(tareaVisible._id.toString());
    expect(res.body.tareas).toHaveLength(1);
  });

  it('CORREGIDO: un administrador solo ve tareas de cursos de su propia institución', async () => {
    const cursoPropio = await crearCurso();
    const cursoAjeno = await crearCurso();
    const moduloPropio = await crearModulo({ cursoId: cursoPropio._id });
    const moduloAjeno = await crearModulo({ cursoId: cursoAjeno._id });

    const tareaPropia = await crearTarea({ cursoId: cursoPropio._id, moduloId: moduloPropio._id, docenteId: cursoPropio.docenteId });
    await crearTarea({ cursoId: cursoAjeno._id, moduloId: moduloAjeno._id, docenteId: cursoAjeno.docenteId });

    const admin = await crearAdministrador({ institucionId: cursoPropio.institucionId });
    const agent = await loginComo(app, admin);
    const res = await agent.get('/api/tareas');

    expect(res.status).toBe(200);
    expect(res.body.tareas).toHaveLength(1);
    expect(res.body.tareas[0]._id).toBe(tareaPropia._id.toString());
  });
});

describe('GET /api/tareas/:id — permisos de visualización', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un padre no seleccionado no puede ver una tarea dirigida a otros', async () => {
    const seleccionado = await crearPadre();
    const noSeleccionado = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(seleccionado._id, 'padre');
    curso.agregarParticipante(noSeleccionado._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({
      cursoId: curso._id, docenteId: curso.docenteId,
      asignacionTipo: 'seleccionados', participantesSeleccionados: [seleccionado._id],
    });

    const agent = await loginComo(app, noSeleccionado);
    const res = await agent.get(`/api/tareas/${tarea._id}`);
    expect(res.status).toBe(403);
  });

  it('responde 404 para un ID inexistente', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/tareas/507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/tareas/:id/close y DELETE', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente asignado cierra la tarea', async () => {
    const tarea = await crearTarea();
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/tareas/${tarea._id}/close`);
    expect(res.status).toBe(200);
    expect((await Tarea.findById(tarea._id)).estado).toBe('cerrada');
  });

  it('un docente que no es el asignado no puede cerrar la tarea', async () => {
    const tarea = await crearTarea();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.patch(`/api/tareas/${tarea._id}/close`);
    expect(res.status).toBe(403);
  });

  it('DELETE marca la tarea como cerrada (soft delete)', async () => {
    const tarea = await crearTarea();
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.delete(`/api/tareas/${tarea._id}`);
    expect(res.status).toBe(200);
    expect((await Tarea.findById(tarea._id)).estado).toBe('cerrada');
  });
});

describe('PUT /api/tareas/:id', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente asignado edita título, descripción y criterios', async () => {
    const tarea = await crearTarea();
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.put(`/api/tareas/${tarea._id}`).send({
      titulo: 'Título actualizado', descripcion: 'Nueva descripción', criterios: 'Ortografía y coherencia',
    });

    expect(res.status).toBe(200);
    expect(res.body.tarea.titulo).toBe('Título actualizado');
    expect((await Tarea.findById(tarea._id)).criterios).toBe('Ortografía y coherencia');
  });

  it('un docente que no es el asignado no puede editar la tarea', async () => {
    const tarea = await crearTarea();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.put(`/api/tareas/${tarea._id}`).send({ titulo: 'Hackeado' });
    expect(res.status).toBe(403);
  });

  it('reemplaza los enlaces existentes por los nuevos enviados en nuevosEnlaces', async () => {
    const tarea = await crearTarea({
      archivosAdjuntos: [{ tipo: 'enlace', url: 'http://viejo.com', nombre: 'Viejo' }],
    });
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.put(`/api/tareas/${tarea._id}`).send({
      nuevosEnlaces: [{ url: 'http://nuevo.com', nombre: 'Nuevo' }],
    });

    expect(res.status).toBe(200);
    const urls = res.body.tarea.archivosAdjuntos.map((a) => a.url);
    expect(urls).toContain('http://viejo.com');
    expect(urls).toContain('http://nuevo.com');
  });

  it('elimina de Cloudinary y del documento los archivos listados en archivosAEliminar', async () => {
    const tarea = await crearTarea({
      archivosAdjuntos: [{ tipo: 'archivo', url: 'http://cloud/a.pdf', publicId: 'carpeta/a', nombre: 'a.pdf', formato: 'pdf' }],
    });
    const docente = await User.findById(tarea.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.put(`/api/tareas/${tarea._id}`).send({ archivosAEliminar: ['carpeta/a'] });

    expect(res.status).toBe(200);
    expect(res.body.tarea.archivosAdjuntos).toHaveLength(0);
  });

  it('responde 404 si la tarea no existe', async () => {
    const docente = await crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.put('/api/tareas/507f1f77bcf86cd799439011').send({ titulo: 'X' });
    expect(res.status).toBe(404);
  });

  // Regresión: canModifyTarea solo comprueba tarea.docenteId, no el curso destino.
  // Sin revalidar, el docente movía su tarea a un curso ajeno (PUT cursoId) y pasaba
  // a poder ver y calificar todas sus entregas.
  it('un docente NO puede mover su tarea a un curso que no le pertenece (PUT cursoId)', async () => {
    const cursoPropio = await crearCurso();
    const docente = await docenteDelCurso(cursoPropio);
    const moduloPropio = await crearModulo({ cursoId: cursoPropio._id });
    const tarea = await crearTarea({ cursoId: cursoPropio._id, moduloId: moduloPropio._id, docenteId: docente._id });

    const cursoAjeno = await crearCurso();
    const moduloAjeno = await crearModulo({ cursoId: cursoAjeno._id });

    const agent = await loginComo(app, docente);
    const res = await agent.put(`/api/tareas/${tarea._id}`).send({
      cursoId: cursoAjeno._id.toString(),
      moduloId: moduloAjeno._id.toString(),
    });

    expect(res.status).toBe(403);
    expect((await Tarea.findById(tarea._id)).cursoId.toString()).toBe(cursoPropio._id.toString());
  });

  it('un docente SÍ puede mover su tarea entre dos cursos suyos', async () => {
    const docente = await crearDocente();
    const cursoA = await crearCurso({ docenteId: docente._id });
    const cursoB = await crearCurso({ docenteId: docente._id });
    const moduloA = await crearModulo({ cursoId: cursoA._id });
    const moduloB = await crearModulo({ cursoId: cursoB._id });
    const tarea = await crearTarea({ cursoId: cursoA._id, moduloId: moduloA._id, docenteId: docente._id });

    const agent = await loginComo(app, docente);
    const res = await agent.put(`/api/tareas/${tarea._id}`).send({
      cursoId: cursoB._id.toString(),
      moduloId: moduloB._id.toString(),
    });

    expect(res.status).toBe(200);
    expect((await Tarea.findById(tarea._id)).cursoId.toString()).toBe(cursoB._id.toString());
  });

  it('rechaza un moduloId que no pertenece al curso de la tarea (PUT)', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const moduloDelCurso = await crearModulo({ cursoId: curso._id });
    const tarea = await crearTarea({ cursoId: curso._id, moduloId: moduloDelCurso._id, docenteId: docente._id });

    const otroCurso = await crearCurso();
    const moduloDeOtroCurso = await crearModulo({ cursoId: otroCurso._id });

    const agent = await loginComo(app, docente);
    const res = await agent.put(`/api/tareas/${tarea._id}`).send({
      moduloId: moduloDeOtroCurso._id.toString(),
    });

    expect(res.status).toBe(400);
  });
});
