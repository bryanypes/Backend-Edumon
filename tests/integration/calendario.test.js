import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import { crearCurso, crearModulo, crearTarea, crearEvento, crearPadre } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const docenteDelCurso = (curso) => User.findById(curso.docenteId);

describe('GET /api/calendario/:cursoId', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
  });

  it('combina tareas y eventos del curso en un solo listado', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    await crearTarea({ cursoId: curso._id, moduloId: modulo._id, docenteId: curso.docenteId });
    await crearEvento({ cursosIds: [curso._id], docenteId: curso.docenteId });

    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);
    const res = await agent.get(`/api/calendario/${curso._id}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.items.some((i) => i.tipo === 'tarea')).toBe(true);
    expect(res.body.items.some((i) => i.tipo === 'evento')).toBe(true);
  });

  it('CORREGIDO: un usuario ajeno al curso no puede ver su calendario', async () => {
    const curso = await crearCurso();
    const ajeno = await crearPadre();
    const agent = await loginComo(app, ajeno);

    const res = await agent.get(`/api/calendario/${curso._id}`);
    expect(res.status).toBe(403);
  });

  it('responde 404 si el curso no existe', async () => {
    const docente = await (await import('../helpers/factories.js')).crearDocente();
    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/calendario/507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/calendario/:cursoId/proximos', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
  });

  it('solo incluye tareas publicadas y eventos futuros/en curso', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    await crearTarea({
      cursoId: curso._id,
      moduloId: modulo._id,
      docenteId: curso.docenteId,
      estado: 'publicada',
      fechaEntrega: new Date(Date.now() + 86400000),
    });
    await crearTarea({
      cursoId: curso._id,
      moduloId: modulo._id,
      docenteId: curso.docenteId,
      estado: 'cerrada',
      fechaEntrega: new Date(Date.now() + 86400000),
    });

    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);
    const res = await agent.get(`/api/calendario/${curso._id}/proximos`);

    expect(res.status).toBe(200);
    expect(res.body.proximosEventos).toHaveLength(1);
  });
});

describe('GET /api/calendario/calendario — vista agregada del usuario', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
  });

  it('agrega los items de TODOS los cursos del padre', async () => {
    const padre = await crearPadre();
    const cursoA = await crearCurso();
    const cursoB = await crearCurso();
    cursoA.agregarParticipante(padre._id, 'padre');
    cursoB.agregarParticipante(padre._id, 'padre');
    await cursoA.save();
    await cursoB.save();

    const moduloA = await crearModulo({ cursoId: cursoA._id });
    const moduloB = await crearModulo({ cursoId: cursoB._id });
    await crearTarea({ cursoId: cursoA._id, moduloId: moduloA._id, docenteId: cursoA.docenteId });
    await crearTarea({ cursoId: cursoB._id, moduloId: moduloB._id, docenteId: cursoB.docenteId });

    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/calendario/calendario');

    expect(res.status).toBe(200);
    expect(res.body.totalCursos).toBe(2);
    expect(res.body.items).toHaveLength(2);
  });

  it('devuelve listas vacías si el usuario no tiene cursos', async () => {
    const padreSinCursos = await crearPadre();
    const agent = await loginComo(app, padreSinCursos);
    const res = await agent.get('/api/calendario/calendario');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('calendario del usuario en hora de Colombia (servidor en UTC)', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
  });

  it('el filtro por mes y la agrupación por día usan el día de Bogotá', async () => {
    const padre = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();
    const modulo = await crearModulo({ cursoId: curso._id });
    // 28 de febrero de 2030 a las 22:00 en Colombia = 1 de marzo 03:00 UTC
    await crearTarea({
      cursoId: curso._id,
      moduloId: modulo._id,
      docenteId: curso.docenteId,
      fechaEntrega: new Date('2030-03-01T03:00:00Z'),
    });

    const agent = await loginComo(app, padre);
    const marzo = await agent.get('/api/calendario/calendario').query({ mes: 3, anio: 2030 });
    const febrero = await agent.get('/api/calendario/calendario').query({ mes: 2, anio: 2030 });

    expect(marzo.body.items).toHaveLength(0);
    expect(febrero.body.items).toHaveLength(1);
    expect(Object.keys(febrero.body.itemsAgrupados)).toEqual(['2030-02-28']);
  });
});
