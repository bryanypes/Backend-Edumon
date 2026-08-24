import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Modulo from '../../src/models/Modulo.js';
import User from '../../src/models/User.js';
import { crearCurso, crearModulo, crearDocente, crearPadre, crearAdministrador } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const docenteDelCurso = (curso) => User.findById(curso.docenteId);

describe('POST /api/modulos', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente dueño del curso crea un módulo', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/modulos').send({ cursoId: curso._id.toString(), titulo: 'Unidad 1' });
    expect(res.status).toBe(201);
    expect(res.body.modulo.titulo).toBe('Unidad 1');
  });

  it('CORREGIDO: un docente NO puede crear módulos en cursos ajenos', async () => {
    const curso = await crearCurso();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.post('/api/modulos').send({ cursoId: curso._id.toString(), titulo: 'Intento ajeno' });
    expect(res.status).toBe(403);
  });

  it('CORREGIDO: un padre no puede crear módulos (requireRole bloquea el rol)', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/modulos').send({ cursoId: curso._id.toString(), titulo: 'Intento de padre' });
    expect(res.status).toBe(403);
  });

  it('un administrador de OTRA institución no puede crear módulos en el curso', async () => {
    const curso = await crearCurso();
    const adminAjeno = await crearAdministrador();
    const agent = await loginComo(app, adminAjeno);

    const res = await agent.post('/api/modulos').send({ cursoId: curso._id.toString(), titulo: 'Intento ajeno' });
    expect(res.status).toBe(403);
  });

  it('rechaza un título de menos de 3 caracteres', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/modulos').send({ cursoId: curso._id.toString(), titulo: 'Hi' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/modulos/curso/:cursoId', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('devuelve los módulos activos del curso, con sus tareas', async () => {
    const curso = await crearCurso();
    await crearModulo({ cursoId: curso._id });
    await crearModulo({ cursoId: curso._id, estado: 'inactivo' });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.get(`/api/modulos/curso/${curso._id}`);
    expect(res.status).toBe(200);
    expect(res.body.modulos).toHaveLength(1);
    expect(res.body.modulos[0].tareas).toBeDefined();
  });

  it('un usuario ajeno al curso no puede ver sus módulos', async () => {
    const curso = await crearCurso();
    await crearModulo({ cursoId: curso._id });
    const padreAjeno = await crearPadre();
    const agent = await loginComo(app, padreAjeno);

    const res = await agent.get(`/api/modulos/curso/${curso._id}`);
    expect(res.status).toBe(403);
  });

  it('incluirInactivos=true incluye los módulos desactivados', async () => {
    const curso = await crearCurso();
    await crearModulo({ cursoId: curso._id, estado: 'inactivo' });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.get(`/api/modulos/curso/${curso._id}?incluirInactivos=true`);
    expect(res.body.modulos).toHaveLength(1);
  });
});

describe('PUT/DELETE/restore de módulos', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente dueño puede editar el módulo', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.put(`/api/modulos/${modulo._id}`).send({ titulo: 'Editado' });
    expect(res.status).toBe(200);
    expect(res.body.modulo.titulo).toBe('Editado');
  });

  it('un docente ajeno no puede editar ni borrar el módulo', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const ajeno = await crearDocente();
    const agent = await loginComo(app, ajeno);

    const resEdit = await agent.put(`/api/modulos/${modulo._id}`).send({ titulo: 'Hackeado' });
    expect(resEdit.status).toBe(403);

    const resDelete = await agent.delete(`/api/modulos/${modulo._id}`);
    expect(resDelete.status).toBe(403);
  });

  it('DELETE desactiva el módulo (soft delete) y restore lo reactiva', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const del = await agent.delete(`/api/modulos/${modulo._id}`);
    expect(del.status).toBe(200);
    expect((await Modulo.findById(modulo._id)).estado).toBe('inactivo');

    const restore = await agent.patch(`/api/modulos/${modulo._id}/restore`);
    expect(restore.status).toBe(200);
    expect((await Modulo.findById(modulo._id)).estado).toBe('activo');
  });

  it('restaurar un módulo ya activo responde 400', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/modulos/${modulo._id}/restore`);
    expect(res.status).toBe(400);
  });
});
