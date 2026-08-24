import { describe, it, expect } from 'vitest';
import Modulo from '../../../src/models/Modulo.js';
import { crearModulo, crearCurso } from '../../helpers/factories.js';

describe('Modulo — validaciones de schema', () => {
  it('requiere cursoId y titulo', () => {
    const modulo = new Modulo({});
    const error = modulo.validateSync();
    expect(error.errors.cursoId).toBeDefined();
    expect(error.errors.titulo).toBeDefined();
  });

  it('rechaza un titulo de más de 200 caracteres', () => {
    const modulo = new Modulo({ cursoId: '507f1f77bcf86cd799439011', titulo: 'x'.repeat(201) });
    expect(modulo.validateSync().errors.titulo).toBeDefined();
  });

  it('estado por defecto es "activo" y rechaza valores fuera del enum', () => {
    const modulo = new Modulo({ cursoId: '507f1f77bcf86cd799439011', titulo: 'Módulo 1' });
    expect(modulo.estado).toBe('activo');
    modulo.estado = 'borrado';
    expect(modulo.validateSync().errors.estado).toBeDefined();
  });
});

describe('Modulo — método perteneceACurso', () => {
  it('devuelve true si el cursoId coincide', async () => {
    const curso = await crearCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    expect(modulo.perteneceACurso(curso._id)).toBe(true);
  });

  it('devuelve false si el cursoId no coincide', async () => {
    const otroCurso = await crearCurso();
    const modulo = await crearModulo();
    expect(modulo.perteneceACurso(otroCurso._id)).toBe(false);
  });
});
