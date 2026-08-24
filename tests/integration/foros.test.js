import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Foro from '../../src/models/Foro.js';
import User from '../../src/models/User.js';
import { crearCurso, crearForo, crearMensajeForo, crearDocente, crearAdministrador, crearPadre } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const docenteDelCurso = (curso) => User.findById(curso.docenteId);

describe('POST /api/foros', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente dueño del curso crea un foro', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/foros').send({
      titulo: 'Dudas de la tarea', descripcion: 'Espacio para resolver dudas de la tarea 1', cursoId: curso._id.toString(),
    });
    expect(res.status).toBe(201);
  });

  it('un padre no puede crear foros', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/foros').send({
      titulo: 'Intento de padre', descripcion: 'Descripción con longitud suficiente', cursoId: curso._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('un docente no puede crear un foro en un curso ajeno', async () => {
    const curso = await crearCurso();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.post('/api/foros').send({
      titulo: 'Foro ajeno', descripcion: 'Descripción con longitud suficiente', cursoId: curso._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('CORREGIDO: un administrador solo puede crear foros en cursos de su propia institución', async () => {
    const curso = await crearCurso();
    const adminAjeno = await crearAdministrador();
    const agent = await loginComo(app, adminAjeno);

    const res = await agent.post('/api/foros').send({
      titulo: 'Foro de otra institución', descripcion: 'Descripción con longitud suficiente', cursoId: curso._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('un administrador de la MISMA institución del curso sí puede crear el foro', async () => {
    const curso = await crearCurso();
    const admin = await crearAdministrador({ institucionId: curso.institucionId });
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/foros').send({
      titulo: 'Foro institucional', descripcion: 'Descripción con longitud suficiente', cursoId: curso._id.toString(),
    });
    expect(res.status).toBe(201);
  });

  it('rechaza un título de menos de 5 caracteres', async () => {
    const curso = await crearCurso();
    const docente = await docenteDelCurso(curso);
    const agent = await loginComo(app, docente);

    const res = await agent.post('/api/foros').send({ titulo: 'Hi', descripcion: 'Descripción con longitud suficiente', cursoId: curso._id.toString() });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/foros/curso/:cursoId y GET /api/foros/:id', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un participante del curso puede listar y ver foros', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();
    const foro = await crearForo({ cursoId: curso._id, docenteId: curso.docenteId });
    const agent = await loginComo(app, padre);

    const lista = await agent.get(`/api/foros/curso/${curso._id}`);
    expect(lista.status).toBe(200);
    expect(lista.body.foros.map((f) => f._id)).toContain(foro._id.toString());

    const detalle = await agent.get(`/api/foros/${foro._id}`);
    expect(detalle.status).toBe(200);
  });

  it('un usuario ajeno al curso no puede ver el foro', async () => {
    const foro = await crearForo();
    const ajeno = await crearPadre();
    const agent = await loginComo(app, ajeno);

    const res = await agent.get(`/api/foros/${foro._id}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/foros/:id/estado y DELETE', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente creador abre/cierra el foro', async () => {
    const foro = await crearForo();
    const docente = await User.findById(foro.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.patch(`/api/foros/${foro._id}/estado`).send({ estado: 'cerrado' });
    expect(res.status).toBe(200);
    expect((await Foro.findById(foro._id)).estado).toBe('cerrado');
  });

  it('un docente que no es el creador no puede cambiar el estado', async () => {
    const foro = await crearForo();
    const otroDocente = await crearDocente();
    const agent = await loginComo(app, otroDocente);

    const res = await agent.patch(`/api/foros/${foro._id}/estado`).send({ estado: 'cerrado' });
    expect(res.status).toBe(403);
  });

  it('el creador elimina el foro y sus mensajes', async () => {
    const foro = await crearForo();
    await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId });
    const docente = await User.findById(foro.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.delete(`/api/foros/${foro._id}`);
    expect(res.status).toBe(200);
    expect(await Foro.findById(foro._id)).toBeNull();
  });
});

describe('GET /api/foros/:id/dashboard', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('devuelve estadísticas y mensajes recientes para un usuario con acceso', async () => {
    const foro = await crearForo();
    await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId, contenido: 'Primer mensaje' });
    const docente = await User.findById(foro.docenteId);
    const agent = await loginComo(app, docente);

    const res = await agent.get(`/api/foros/${foro._id}/dashboard`);
    expect(res.status).toBe(200);
    expect(res.body.estadisticas.totalMensajes).toBe(1);
    expect(res.body.mensajesRecientes).toHaveLength(1);
  });
});
