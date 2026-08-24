import { describe, it, expect } from 'vitest';
import Evento from '../../../src/models/Evento.js';
import { crearEvento } from '../../helpers/factories.js';

const manana = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const pasadoManana = () => new Date(Date.now() + 48 * 60 * 60 * 1000);

const base = () => ({
  titulo: 'Reunión de padres',
  descripcion: 'Descripción con más de diez caracteres',
  fechaInicio: manana(),
  fechaFin: pasadoManana(),
  hora: '10:00',
  ubicacion: 'Auditorio',
  docenteId: '507f1f77bcf86cd799439011',
  cursosIds: ['507f1f77bcf86cd799439012'],
  categoria: 'institucional',
});

describe('Evento — validaciones de schema', () => {
  it('requiere titulo, descripcion, fechaInicio, fechaFin, hora, ubicacion, docenteId y categoria', () => {
    const error = new Evento({}).validateSync();
    expect(error.errors.titulo).toBeDefined();
    expect(error.errors.descripcion).toBeDefined();
    expect(error.errors.fechaInicio).toBeDefined();
    expect(error.errors.fechaFin).toBeDefined();
    expect(error.errors.hora).toBeDefined();
    expect(error.errors.ubicacion).toBeDefined();
    expect(error.errors.docenteId).toBeDefined();
    expect(error.errors.categoria).toBeDefined();
  });

  it('rechaza un titulo de menos de 3 caracteres', () => {
    const evento = new Evento({ ...base(), titulo: 'Hi' });
    expect(evento.validateSync().errors.titulo).toBeDefined();
  });

  it('rechaza una descripcion de menos de 10 caracteres', () => {
    const evento = new Evento({ ...base(), descripcion: 'corta' });
    expect(evento.validateSync().errors.descripcion).toBeDefined();
  });

  it('rechaza una fechaInicio en el pasado', () => {
    const evento = new Evento({ ...base(), fechaInicio: new Date(Date.now() - 60000) });
    expect(evento.validateSync().errors.fechaInicio).toBeDefined();
  });

  it('rechaza una fechaFin anterior o igual a fechaInicio', () => {
    const inicio = manana();
    const evento = new Evento({ ...base(), fechaInicio: inicio, fechaFin: inicio });
    expect(evento.validateSync().errors.fechaFin).toBeDefined();
  });

  it('acepta una fechaFin posterior a fechaInicio', () => {
    const evento = new Evento(base());
    expect(evento.validateSync()?.errors.fechaFin).toBeUndefined();
  });

  it('rechaza una hora que no cumple el formato HH:MM de 24 horas', () => {
    expect(new Evento({ ...base(), hora: '25:00' }).validateSync().errors.hora).toBeDefined();
    expect(new Evento({ ...base(), hora: '10:65' }).validateSync().errors.hora).toBeDefined();
    expect(new Evento({ ...base(), hora: '10am' }).validateSync().errors.hora).toBeDefined();
  });

  it('rechaza una categoria fuera del enum', () => {
    const evento = new Evento({ ...base(), categoria: 'cumpleaños' });
    expect(evento.validateSync().errors.categoria).toBeDefined();
  });

  it('estado por defecto es "programado"', () => {
    const evento = new Evento(base());
    expect(evento.estado).toBe('programado');
  });
});

describe('Evento — transición automática de estado en pre-save', () => {
  it('permanece "programado" si todavía no comienza', async () => {
    const evento = await crearEvento({ fechaInicio: manana(), fechaFin: pasadoManana() });
    expect(evento.estado).toBe('programado');
  });

  it('pasa a "en_curso" si ya comenzó pero no ha terminado', async () => {
    const evento = new Evento({
      ...base(),
      fechaInicio: new Date(Date.now() - 60 * 60 * 1000),
      fechaFin: new Date(Date.now() + 60 * 60 * 1000),
    });
    // Se salta la validación (fechaInicio ya no es "futura") para poder probar
    // la transición automática de estado, que es un hook de save independiente.
    await evento.save({ validateBeforeSave: false });
    expect(evento.estado).toBe('en_curso');
  });

  it('pasa a "finalizado" si ya terminó', async () => {
    const evento = new Evento({
      ...base(),
      fechaInicio: new Date(Date.now() - 2 * 60 * 60 * 1000),
      fechaFin: new Date(Date.now() - 60 * 60 * 1000),
    });
    await evento.save({ validateBeforeSave: false });
    expect(evento.estado).toBe('finalizado');
  });
});

describe('Evento — métodos y virtuals', () => {
  it('haComenzado/haFinalizado reflejan la fecha actual contra fechaInicio/fechaFin', async () => {
    const evento = await crearEvento({ fechaInicio: manana(), fechaFin: pasadoManana() });
    expect(evento.haComenzado()).toBe(false);
    expect(evento.haFinalizado()).toBe(false);
  });

  it('categoriaLabel traduce la categoría a una etiqueta legible', async () => {
    const evento = await crearEvento({ categoria: 'escuela_padres' });
    expect(evento.categoriaLabel).toBe('Escuela de Padres');
  });
});
