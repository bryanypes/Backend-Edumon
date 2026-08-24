import { describe, it, expect, vi } from 'vitest';
import { canViewTarea, canModifyTarea, filterTareasForUser } from '../../../src/middlewares/tareaAuthMiddleware.js';
import { crearCurso, crearPadre, crearTarea } from '../../helpers/factories.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('canViewTarea', () => {
  it('responde 404 si la tarea no existe', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439011' }, user: { userId: '507f1f77bcf86cd799439012' } };
    const res = mockRes();
    const next = vi.fn();

    await canViewTarea(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite ver la tarea al docente asignado', async () => {
    const tarea = await crearTarea();
    const req = { params: { id: tarea._id.toString() }, user: { userId: tarea.docenteId.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canViewTarea(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rechaza a un padre que no es participante del curso cuando asignacionTipo=todos', async () => {
    const curso = await crearCurso();
    const tarea = await crearTarea({ cursoId: curso._id, docenteId: curso.docenteId, asignacionTipo: 'todos' });
    const padreAjeno = await crearPadre();
    const req = { params: { id: tarea._id.toString() }, user: { userId: padreAjeno._id.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canViewTarea(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite ver la tarea a un padre participante del curso cuando asignacionTipo=todos', async () => {
    const padre = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({ cursoId: curso._id, docenteId: curso.docenteId, asignacionTipo: 'todos' });
    const req = { params: { id: tarea._id.toString() }, user: { userId: padre._id.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canViewTarea(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rechaza a un padre no seleccionado cuando asignacionTipo=seleccionados', async () => {
    const seleccionado = await crearPadre();
    const noSeleccionado = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(seleccionado._id, 'padre');
    curso.agregarParticipante(noSeleccionado._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({
      cursoId: curso._id,
      docenteId: curso.docenteId,
      asignacionTipo: 'seleccionados',
      participantesSeleccionados: [seleccionado._id],
    });

    const req = { params: { id: tarea._id.toString() }, user: { userId: noSeleccionado._id.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canViewTarea(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('permite ver la tarea a un padre seleccionado cuando asignacionTipo=seleccionados', async () => {
    const seleccionado = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(seleccionado._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({
      cursoId: curso._id,
      docenteId: curso.docenteId,
      asignacionTipo: 'seleccionados',
      participantesSeleccionados: [seleccionado._id],
    });

    const req = { params: { id: tarea._id.toString() }, user: { userId: seleccionado._id.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canViewTarea(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('canModifyTarea', () => {
  it('responde 404 si la tarea no existe', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439011' }, user: { userId: '507f1f77bcf86cd799439012' } };
    const res = mockRes();
    const next = vi.fn();

    await canModifyTarea(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responde 403 si el usuario no es el docente asignado', async () => {
    const tarea = await crearTarea();
    const req = { params: { id: tarea._id.toString() }, user: { userId: '507f1f77bcf86cd799439012' } };
    const res = mockRes();
    const next = vi.fn();

    await canModifyTarea(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('llama a next() si el usuario es el docente asignado', async () => {
    const tarea = await crearTarea();
    const req = { params: { id: tarea._id.toString() }, user: { userId: tarea.docenteId.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canModifyTarea(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('filterTareasForUser', () => {
  it('no agrega filtro para el rol docente (el controlador filtra por su propio docenteId)', async () => {
    const req = { user: { userId: 'x', rol: 'docente' } };
    const res = mockRes();
    const next = vi.fn();

    await filterTareasForUser(req, res, next);

    expect(req.filteredUserId).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('agrega req.filteredUserId para un padre', async () => {
    const req = { user: { userId: 'padre-id-123', rol: 'padre' } };
    const res = mockRes();
    const next = vi.fn();

    await filterTareasForUser(req, res, next);

    expect(req.filteredUserId).toBe('padre-id-123');
    expect(next).toHaveBeenCalledOnce();
  });
});
