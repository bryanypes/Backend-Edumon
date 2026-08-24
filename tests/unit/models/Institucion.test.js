import { describe, it, expect } from 'vitest';
import Institucion from '../../../src/models/Institucion.js';
import { crearInstitucion } from '../../helpers/factories.js';

describe('Institucion — validaciones de schema', () => {
  it('requiere nombre y nit', () => {
    const error = new Institucion({}).validateSync();
    expect(error.errors.nombre).toBeDefined();
    expect(error.errors.nit).toBeDefined();
  });

  it('activo por defecto es true', () => {
    const institucion = new Institucion({ nombre: 'Colegio X', nit: '123' });
    expect(institucion.activo).toBe(true);
  });
});

describe('Institucion — generación automática de código', () => {
  it('genera un código con el formato EDU-XXXXXX al guardar', async () => {
    const institucion = await crearInstitucion();
    expect(institucion.codigo).toMatch(/^EDU-[A-Z0-9]{6}$/);
  });

  it('no sobreescribe el código si ya venía asignado', async () => {
    const institucion = await crearInstitucion({ codigo: 'EDU-FIJO1' });
    expect(institucion.codigo).toBe('EDU-FIJO1');
  });

  it('cada institución recibe un código distinto', async () => {
    const a = await crearInstitucion();
    const b = await crearInstitucion();
    expect(a.codigo).not.toBe(b.codigo);
  });
});

describe('Institucion — índices únicos', () => {
  it('rechaza un NIT duplicado', async () => {
    await crearInstitucion({ nit: 'NIT-DUPLICADO' });
    await expect(crearInstitucion({ nit: 'NIT-DUPLICADO' })).rejects.toThrow();
  });

  it('rechaza un código duplicado asignado a mano', async () => {
    await crearInstitucion({ codigo: 'EDU-REPET1' });
    await expect(crearInstitucion({ codigo: 'EDU-REPET1' })).rejects.toThrow();
  });
});
