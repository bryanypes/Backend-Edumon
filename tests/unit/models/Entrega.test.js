import { describe, it, expect } from 'vitest';
import Entrega from '../../../src/models/Entrega.js';
import { crearEntrega, crearTarea, crearPadre } from '../../helpers/factories.js';

describe('Entrega — validaciones de schema', () => {
  it('requiere tareaId y padreId', () => {
    const error = new Entrega({}).validateSync();
    expect(error.errors.tareaId).toBeDefined();
    expect(error.errors.padreId).toBeDefined();
  });

  it('estado por defecto es "borrador"', () => {
    const entrega = new Entrega({ tareaId: '507f1f77bcf86cd799439011', padreId: '507f1f77bcf86cd799439012' });
    expect(entrega.estado).toBe('borrador');
  });

  it('rechaza una valoracion fuera del rango 1-5', () => {
    const base = { tareaId: '507f1f77bcf86cd799439011', padreId: '507f1f77bcf86cd799439012' };
    expect(new Entrega({ ...base, calificacion: { valoracion: 0 } }).validateSync().errors['calificacion.valoracion']).toBeDefined();
    expect(new Entrega({ ...base, calificacion: { valoracion: 6 } }).validateSync().errors['calificacion.valoracion']).toBeDefined();
  });

  it('rechaza una valoracion no entera', () => {
    const entrega = new Entrega({
      tareaId: '507f1f77bcf86cd799439011',
      padreId: '507f1f77bcf86cd799439012',
      calificacion: { valoracion: 3.5 },
    });
    expect(entrega.validateSync().errors['calificacion.valoracion']).toBeDefined();
  });

  it('acepta una valoracion entera entre 1 y 5', () => {
    const entrega = new Entrega({
      tareaId: '507f1f77bcf86cd799439011',
      padreId: '507f1f77bcf86cd799439012',
      calificacion: { valoracion: 4 },
    });
    expect(entrega.validateSync()?.errors['calificacion.valoracion']).toBeUndefined();
  });

  it('rechaza un textoRespuesta de más de 5000 caracteres', () => {
    const entrega = new Entrega({
      tareaId: '507f1f77bcf86cd799439011',
      padreId: '507f1f77bcf86cd799439012',
      textoRespuesta: 'x'.repeat(5001),
    });
    expect(entrega.validateSync().errors.textoRespuesta).toBeDefined();
  });
});

describe('Entrega — índice único (tareaId, padreId)', () => {
  it('rechaza una segunda entrega del mismo padre para la misma tarea', async () => {
    const tarea = await crearTarea();
    const padre = await crearPadre();
    await crearEntrega({ tareaId: tarea._id, padreId: padre._id });
    await expect(crearEntrega({ tareaId: tarea._id, padreId: padre._id })).rejects.toThrow();
  });

  it('permite entregas del mismo padre para tareas distintas', async () => {
    const padre = await crearPadre();
    const tareaA = await crearTarea();
    const tareaB = await crearTarea();
    await crearEntrega({ tareaId: tareaA._id, padreId: padre._id });
    await expect(crearEntrega({ tareaId: tareaB._id, padreId: padre._id })).resolves.toBeTruthy();
  });
});

describe('Entrega — virtuals', () => {
  it('estaCalificada es false sin valoracion y true con ella', async () => {
    const sinCalificar = await crearEntrega();
    expect(sinCalificar.estaCalificada).toBe(false);

    sinCalificar.calificacion = { valoracion: 5 };
    await sinCalificar.save();
    expect(sinCalificar.estaCalificada).toBe(true);
  });

  it('estrellas representa la valoracion en emojis, o null si no hay valoracion', async () => {
    const entrega = await crearEntrega();
    expect(entrega.estrellas).toBeNull();

    entrega.calificacion = { valoracion: 3 };
    await entrega.save();
    expect(entrega.estrellas).toBe('⭐⭐⭐☆☆');
  });
});
