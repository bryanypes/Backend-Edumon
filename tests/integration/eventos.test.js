import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Evento from '../../src/models/Evento.js';
import User from '../../src/models/User.js';
import { crearCurso, crearEvento, crearDocente, crearAdministrador, crearPadre, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const docenteDelCurso = (curso) => User.findById(curso.docenteId);
const manana = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const pasadoManana = () => new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

describe('POST /api/eventos', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente crea un evento para su propio curso', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/eventos').send({
      titulo: 'Reunión de padres', descripcion: 'Reunión trimestral de seguimiento académico',
      fechaInicio: manana(), fechaFin: pasadoManana(), hora: '15:00', ubicacion: 'Auditorio',
      cursosIds: [curso._id.toString()], categoria: 'escuela_padres',
    });
    expect(res.status).toBe(201);
  });

  it('un padre no puede crear eventos', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/eventos').send({
      titulo: 'Evento de padre', descripcion: 'Descripción con longitud suficiente',
      fechaInicio: manana(), fechaFin: pasadoManana(), hora: '15:00', ubicacion: 'Auditorio',
      cursosIds: ['507f1f77bcf86cd799439011'], categoria: 'institucional',
    });
    expect(res.status).toBe(403);
  });

  it('un docente no puede crear un evento para un curso ajeno', async () => {
    const curso = await crearCurso();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.post('/api/eventos').send({
      titulo: 'Evento ajeno', descripcion: 'Descripción con longitud suficiente',
      fechaInicio: manana(), fechaFin: pasadoManana(), hora: '15:00', ubicacion: 'Auditorio',
      cursosIds: [curso._id.toString()], categoria: 'institucional',
    });
    expect(res.status).toBe(403);
  });

  it('un administrador solo puede crear eventos para cursos de su propia institución', async () => {
    const curso = await crearCurso();
    const adminAjeno = await crearAdministrador();
    const agent = await loginComo(app, adminAjeno);

    const res = await agent.post('/api/eventos').send({
      titulo: 'Evento ajeno', descripcion: 'Descripción con longitud suficiente',
      fechaInicio: manana(), fechaFin: pasadoManana(), hora: '15:00', ubicacion: 'Auditorio',
      cursosIds: [curso._id.toString()], categoria: 'institucional',
    });
    expect(res.status).toBe(403);
  });

  it('rechaza fechaFin anterior a fechaInicio', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/eventos').send({
      titulo: 'Evento inválido', descripcion: 'Descripción con longitud suficiente',
      fechaInicio: pasadoManana(), fechaFin: manana(), hora: '15:00', ubicacion: 'Auditorio',
      cursosIds: [curso._id.toString()], categoria: 'institucional',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/eventos — visibilidad por rol', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un padre solo ve eventos de cursos donde participa', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();

    const eventoVisible = await crearEvento({ cursosIds: [curso._id], docenteId: curso.docenteId });
    await crearEvento(); // de un curso ajeno

    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/eventos');

    expect(res.status).toBe(200);
    expect(res.body.eventos.map((e) => e._id)).toContain(eventoVisible._id.toString());
    expect(res.body.eventos).toHaveLength(1);
  });

  it('CORREGIDO: un administrador solo ve eventos de cursos de su propia institución', async () => {
    const institucion = await crearInstitucion();
    const cursoPropio = await crearCurso({ institucionId: institucion._id });
    const cursoAjeno = await crearCurso();

    await crearEvento({ cursosIds: [cursoPropio._id], docenteId: cursoPropio.docenteId });
    await crearEvento({ cursosIds: [cursoAjeno._id], docenteId: cursoAjeno.docenteId });

    const admin = await crearAdministrador({ institucionId: institucion._id });
    const agent = await loginComo(app, admin);

    const res = await agent.get('/api/eventos');
    expect(res.status).toBe(200);
    expect(res.body.eventos).toHaveLength(1);
  });
});

describe('PUT/DELETE de eventos', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente creador puede editar su evento', async () => {
    const evento = await crearEvento();
    const docente = await User.findById(evento.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.put(`/api/eventos/${evento._id}`).send({ titulo: 'Título editado' });
    expect(res.status).toBe(200);
    expect(res.body.evento.titulo).toBe('Título editado');
  });

  it('un docente ajeno no puede editar ni borrar el evento', async () => {
    const evento = await crearEvento();
    const ajeno = await crearDocente();
    const agent = await loginComo(app, ajeno);

    expect((await agent.put(`/api/eventos/${evento._id}`).send({ titulo: 'Hackeado' })).status).toBe(403);
    expect((await agent.delete(`/api/eventos/${evento._id}`)).status).toBe(403);
  });

  it('DELETE elimina el evento definitivamente', async () => {
    const evento = await crearEvento();
    const docente = await User.findById(evento.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.delete(`/api/eventos/${evento._id}`);
    expect(res.status).toBe(200);
    expect(await Evento.findById(evento._id)).toBeNull();
  });
});

describe('GET /api/eventos/hoy', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('devuelve solo los eventos cuya fechaInicio cae hoy', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);

    const hoyMasUnaHora = new Date();
    hoyMasUnaHora.setHours(hoyMasUnaHora.getHours() + 1);
    // Si "hoy + 1h" cruza a mañana (test corrido cerca de medianoche), se omite
    // esta aserción específica de forma segura en vez de dar un falso negativo.
    if (hoyMasUnaHora.toDateString() !== new Date().toDateString()) return;

    await Evento.create({
      titulo: 'Evento de hoy', descripcion: 'Descripción con longitud suficiente',
      fechaInicio: hoyMasUnaHora, fechaFin: new Date(hoyMasUnaHora.getTime() + 3600000),
      hora: '10:00', ubicacion: 'Aquí', docenteId: docente._id, cursosIds: [curso._id], categoria: 'institucional',
    });

    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/eventos/hoy');
    expect(res.status).toBe(200);
    expect(res.body.eventos.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PATCH /api/eventos/:id/cancelar', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente creador cancela su evento futuro', async () => {
    const evento = await crearEvento();
    const docente = await User.findById(evento.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/eventos/${evento._id}/cancelar`);
    expect(res.status).toBe(200);
    expect((await Evento.findById(evento._id)).estado).toBe('cancelado');
  });

  it('un docente ajeno no puede cancelar', async () => {
    const evento = await crearEvento();
    const ajeno = await crearDocente();
    const agent = await loginComo(app, ajeno);

    const res = await agent.patch(`/api/eventos/${evento._id}/cancelar`);
    expect(res.status).toBe(403);
  });

  it('un administrador de otra institución no puede cancelar', async () => {
    const evento = await crearEvento();
    const adminAjeno = await crearAdministrador();
    const agent = await loginComo(app, adminAjeno);

    const res = await agent.patch(`/api/eventos/${evento._id}/cancelar`);
    expect(res.status).toBe(403);
  });

  it('no se puede cancelar un evento ya cancelado', async () => {
    const evento = await crearEvento();
    const docente = await User.findById(evento.docenteId);
    const agent = await loginComo(app, docente);

    await agent.patch(`/api/eventos/${evento._id}/cancelar`);
    const segunda = await agent.patch(`/api/eventos/${evento._id}/cancelar`);
    expect(segunda.status).toBe(400);
  });

  it('no se puede cancelar un evento ya finalizado', async () => {
    const evento = await crearEvento();
    const docente = await User.findById(evento.docenteId);

    // Se fuerza a "finalizado" directamente (sin pasar por el validador de
    // fechaInicio futura, igual que en el test del modelo Evento).
    await Evento.findByIdAndUpdate(evento._id, { estado: 'finalizado' });

    const agent = await loginComo(app, docente);
    const res = await agent.patch(`/api/eventos/${evento._id}/cancelar`);
    expect(res.status).toBe(400);
  });

  it('un padre no puede cancelar eventos', async () => {
    const evento = await crearEvento();
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.patch(`/api/eventos/${evento._id}/cancelar`);
    expect(res.status).toBe(403);
  });
});
