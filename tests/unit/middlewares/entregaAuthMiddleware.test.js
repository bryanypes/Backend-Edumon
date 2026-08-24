import { describe, it, expect, vi } from 'vitest';
import {
  canCreateEntrega,
  canModifyEntrega,
  canViewEntrega,
  canCalificarEntrega,
  filterEntregasForUser,
} from '../../../src/middlewares/entregaAuthMiddleware.js';
import { crearCurso, crearPadre, crearTarea, crearEntrega } from '../../helpers/factories.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('canCreateEntrega', () => {
  it('responde 403 si el padreId del body no coincide con el usuario autenticado', async () => {
    const padre = await crearPadre();
    const req = { body: { tareaId: '507f1f77bcf86cd799439011', padreId: 'otro-id' }, user: { userId: padre._id.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canCreateEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 404 si la tarea no existe', async () => {
    const padre = await crearPadre();
    const req = {
      body: { tareaId: '507f1f77bcf86cd799439011', padreId: padre._id.toString() },
      user: { userId: padre._id.toString() },
    };
    const res = mockRes();
    const next = vi.fn();

    await canCreateEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responde 403 si el padre no es participante del curso de la tarea', async () => {
    const padreAjeno = await crearPadre();
    const tarea = await crearTarea();
    const req = {
      body: { tareaId: tarea._id.toString(), padreId: padreAjeno._id.toString() },
      user: { userId: padreAjeno._id.toString() },
    };
    const res = mockRes();
    const next = vi.fn();

    await canCreateEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('responde 403 si asignacionTipo=seleccionados y el padre no está en la lista, aunque sea participante del curso', async () => {
    const padre = await crearPadre();
    const otroPadre = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(padre._id, 'padre');
    curso.agregarParticipante(otroPadre._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({
      cursoId: curso._id,
      docenteId: curso.docenteId,
      asignacionTipo: 'seleccionados',
      participantesSeleccionados: [otroPadre._id],
    });

    const req = {
      body: { tareaId: tarea._id.toString(), padreId: padre._id.toString() },
      user: { userId: padre._id.toString() },
    };
    const res = mockRes();
    const next = vi.fn();

    await canCreateEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('llama a next() si el padre es participante y (cuando aplica) está seleccionado', async () => {
    const padre = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({ cursoId: curso._id, docenteId: curso.docenteId, asignacionTipo: 'todos' });

    const req = {
      body: { tareaId: tarea._id.toString(), padreId: padre._id.toString() },
      user: { userId: padre._id.toString() },
    };
    const res = mockRes();
    const next = vi.fn();

    await canCreateEntrega(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('canModifyEntrega', () => {
  it('responde 404 si la entrega no existe', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439011' }, user: { userId: 'x' }, method: 'PUT' };
    const res = mockRes();
    const next = vi.fn();

    await canModifyEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responde 403 si el usuario no es el padre dueño de la entrega', async () => {
    const entrega = await crearEntrega();
    const req = { params: { id: entrega._id.toString() }, user: { userId: 'otro-padre' }, method: 'PUT' };
    const res = mockRes();
    const next = vi.fn();

    await canModifyEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('responde 400 si la entrega ya no está en borrador y el método no es DELETE', async () => {
    const entrega = await crearEntrega({ estado: 'enviada' });
    const req = { params: { id: entrega._id.toString() }, user: { userId: entrega.padreId.toString() }, method: 'PUT' };
    const res = mockRes();
    const next = vi.fn();

    await canModifyEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('permite DELETE incluso si la entrega ya no está en borrador (el controlador la vuelve a validar)', async () => {
    const entrega = await crearEntrega({ estado: 'enviada' });
    const req = { params: { id: entrega._id.toString() }, user: { userId: entrega.padreId.toString() }, method: 'DELETE' };
    const res = mockRes();
    const next = vi.fn();

    await canModifyEntrega(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('llama a next() para el dueño con una entrega en borrador', async () => {
    const entrega = await crearEntrega({ estado: 'borrador' });
    const req = { params: { id: entrega._id.toString() }, user: { userId: entrega.padreId.toString() }, method: 'PUT' };
    const res = mockRes();
    const next = vi.fn();

    await canModifyEntrega(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('canViewEntrega', () => {
  it('permite ver al padre dueño de la entrega', async () => {
    const entrega = await crearEntrega();
    const req = { params: { id: entrega._id.toString() }, user: { userId: entrega.padreId.toString(), rol: 'padre' } };
    const res = mockRes();
    const next = vi.fn();

    await canViewEntrega(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('permite ver al docente de la tarea', async () => {
    const tarea = await crearTarea();
    const entrega = await crearEntrega({ tareaId: tarea._id });
    const req = { params: { id: entrega._id.toString() }, user: { userId: tarea.docenteId.toString(), rol: 'docente' } };
    const res = mockRes();
    const next = vi.fn();

    await canViewEntrega(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rechaza a un padre ajeno que tampoco es el docente de la tarea', async () => {
    const entrega = await crearEntrega();
    const padreAjeno = await crearPadre();
    const req = { params: { id: entrega._id.toString() }, user: { userId: padreAjeno._id.toString(), rol: 'padre' } };
    const res = mockRes();
    const next = vi.fn();

    await canViewEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('canCalificarEntrega', () => {
  it('responde 403 si quien califica no es el docente asignado a la tarea', async () => {
    const tarea = await crearTarea();
    const entrega = await crearEntrega({ tareaId: tarea._id });
    const req = { params: { id: entrega._id.toString() }, user: { userId: 'otro-docente' } };
    const res = mockRes();
    const next = vi.fn();

    await canCalificarEntrega(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('llama a next() si quien califica es el docente asignado a la tarea', async () => {
    const tarea = await crearTarea();
    const entrega = await crearEntrega({ tareaId: tarea._id });
    const req = { params: { id: entrega._id.toString() }, user: { userId: tarea.docenteId.toString() } };
    const res = mockRes();
    const next = vi.fn();

    await canCalificarEntrega(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('filterEntregasForUser', () => {
  it('para un docente, adjunta req.docenteTareaIds con los IDs de sus tareas', async () => {
    const tarea = await crearTarea();
    const req = { user: { userId: tarea.docenteId.toString(), rol: 'docente' } };
    const res = mockRes();
    const next = vi.fn();

    await filterEntregasForUser(req, res, next);

    expect(req.docenteTareaIds.map(String)).toContain(tarea._id.toString());
    expect(next).toHaveBeenCalledOnce();
  });

  it('para un padre, adjunta req.filteredPadreId', async () => {
    const req = { user: { userId: 'padre-id-123', rol: 'padre' } };
    const res = mockRes();
    const next = vi.fn();

    await filterEntregasForUser(req, res, next);

    expect(req.filteredPadreId).toBe('padre-id-123');
    expect(next).toHaveBeenCalledOnce();
  });
});
