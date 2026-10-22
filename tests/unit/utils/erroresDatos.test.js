import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { errorDeDatos, conCorreoVacioComoUnset } from '../../../src/utils/erroresDatos.js';
import Modulo from '../../../src/models/Modulo.js';

describe('errorDeDatos', () => {
  it('un dato inválido es 400 con el mensaje del modelo', () => {
    const error = new Modulo({ titulo: 'x'.repeat(300) }).validateSync();
    const r = errorDeDatos(error);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/obligatorio|exceder/);
  });

  it('un valor repetido es 409 con el campo correcto', () => {
    expect(errorDeDatos({ code: 11000, keyPattern: { correo: 1 } })).toEqual({ status: 409, body: { message: 'Ya existe un usuario con este correo electrónico' } });
    expect(errorDeDatos({ code: 11000, keyPattern: { cedula: 1 } }).body.message).toMatch(/cédula/);
    expect(errorDeDatos({ code: 11000, keyPattern: { otro: 1 } }).body.message).toMatch(/Ya existe un registro/);
  });

  it('un id mal formado es 400', () => {
    const error = new mongoose.Error.CastError('ObjectId', 'no-es-id', 'cursoId');
    expect(errorDeDatos(error).status).toBe(400);
  });

  it('cualquier otro error no se toca (sigue siendo 500)', () => {
    expect(errorDeDatos(new Error('se cayó la base'))).toBeNull();
  });
});

describe('conCorreoVacioComoUnset', () => {
  it('correo vacío o null se quita en vez de guardarse como ""', () => {
    expect(conCorreoVacioComoUnset({ nombre: 'A', correo: '' })).toEqual({ nombre: 'A', $unset: { correo: 1 } });
    expect(conCorreoVacioComoUnset({ correo: null })).toEqual({ $unset: { correo: 1 } });
    expect(conCorreoVacioComoUnset({ correo: 'a@b.co' })).toEqual({ correo: 'a@b.co' });
    expect(conCorreoVacioComoUnset({ nombre: 'A' })).toEqual({ nombre: 'A' });
  });
});
