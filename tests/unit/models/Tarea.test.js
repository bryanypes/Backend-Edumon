import { describe, it, expect } from 'vitest';
import Tarea from '../../../src/models/Tarea.js';
import { crearTarea, crearCurso, crearModulo, crearPadre } from '../../helpers/factories.js';

const base = () => ({
  titulo: 'Tarea 1',
  fechaEntrega: new Date(Date.now() + 86400000),
  docenteId: '507f1f77bcf86cd799439011',
  cursoId: '507f1f77bcf86cd799439012',
  moduloId: '507f1f77bcf86cd799439013',
  tipoEntrega: 'texto',
});

describe('Tarea — validaciones de schema', () => {
  it('requiere titulo, fechaEntrega, docenteId, tipoEntrega, cursoId y moduloId', () => {
    const error = new Tarea({}).validateSync();
    expect(error.errors.titulo).toBeDefined();
    expect(error.errors.fechaEntrega).toBeDefined();
    expect(error.errors.docenteId).toBeDefined();
    expect(error.errors.tipoEntrega).toBeDefined();
    expect(error.errors.cursoId).toBeDefined();
    expect(error.errors.moduloId).toBeDefined();
  });

  it('rechaza un tipoEntrega fuera del enum', () => {
    const tarea = new Tarea({ ...base(), tipoEntrega: 'oral' });
    expect(tarea.validateSync().errors.tipoEntrega).toBeDefined();
  });

  it('asignacionTipo por defecto es "todos" y estado por defecto es "publicada"', () => {
    const tarea = new Tarea(base());
    expect(tarea.asignacionTipo).toBe('todos');
    expect(tarea.estado).toBe('publicada');
  });

  it('rechaza asignacionTipo "seleccionados" sin ningún participante', () => {
    const tarea = new Tarea({ ...base(), asignacionTipo: 'seleccionados', participantesSeleccionados: [] });
    expect(tarea.validateSync().errors.participantesSeleccionados).toBeDefined();
  });

  it('acepta asignacionTipo "seleccionados" con al menos un participante', () => {
    const tarea = new Tarea({
      ...base(),
      asignacionTipo: 'seleccionados',
      participantesSeleccionados: ['507f1f77bcf86cd799439099'],
    });
    expect(tarea.validateSync()?.errors.participantesSeleccionados).toBeUndefined();
  });
});

describe('Tarea — pre-save: limpiar participantes cuando asignacionTipo=todos', () => {
  it('vacía participantesSeleccionados al guardar si asignacionTipo es "todos"', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const padre = await crearPadre();

    const tarea = await crearTarea({
      cursoId: curso._id,
      moduloId: modulo._id,
      docenteId: curso.docenteId,
      asignacionTipo: 'seleccionados',
      participantesSeleccionados: [padre._id],
    });
    expect(tarea.participantesSeleccionados.length).toBe(1);

    tarea.asignacionTipo = 'todos';
    await tarea.save();
    expect(tarea.participantesSeleccionados.length).toBe(0);
  });
});

describe('Tarea — virtuals', () => {
  it('estaVencida es true solo si fechaEntrega ya pasó y sigue publicada', async () => {
    const vencida = await crearTarea({ fechaEntrega: new Date(Date.now() - 1000), estado: 'publicada' });
    expect(vencida.estaVencida).toBe(true);

    const futura = await crearTarea({ fechaEntrega: new Date(Date.now() + 100000), estado: 'publicada' });
    expect(futura.estaVencida).toBe(false);

    const cerradaYVencida = await crearTarea({ fechaEntrega: new Date(Date.now() - 1000), estado: 'cerrada' });
    expect(cerradaYVencida.estaVencida).toBe(false);
  });

  it('totalArchivos, soloArchivos y soloEnlaces separan correctamente por tipo', async () => {
    const tarea = await crearTarea({
      archivosAdjuntos: [
        { tipo: 'archivo', url: 'http://x.com/a.pdf', nombre: 'a.pdf' },
        { tipo: 'enlace', url: 'http://x.com', nombre: 'Enlace' },
        { tipo: 'archivo', url: 'http://x.com/b.pdf', nombre: 'b.pdf' },
      ],
    });

    expect(tarea.totalArchivos).toBe(3);
    expect(tarea.soloArchivos).toHaveLength(2);
    expect(tarea.soloEnlaces).toHaveLength(1);
  });
});
