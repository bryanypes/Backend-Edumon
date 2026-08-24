import { describe, it, expect } from 'vitest';
import PerfilFamiliar from '../../../src/models/PerfilFamiliar.js';
import { crearPerfilFamiliar, crearPadre } from '../../helpers/factories.js';

describe('PerfilFamiliar — validaciones de schema', () => {
  it('requiere titularId y nombre', () => {
    const error = new PerfilFamiliar({}).validateSync();
    expect(error.errors.titularId).toBeDefined();
    expect(error.errors.nombre).toBeDefined();
  });

  it('rechaza un nombre de más de 50 caracteres', () => {
    const perfil = new PerfilFamiliar({ titularId: '507f1f77bcf86cd799439011', nombre: 'x'.repeat(51) });
    expect(perfil.validateSync().errors.nombre).toBeDefined();
  });

  it('activo por defecto es true', () => {
    const perfil = new PerfilFamiliar({ titularId: '507f1f77bcf86cd799439011', nombre: 'Hijo' });
    expect(perfil.activo).toBe(true);
  });
});

describe('PerfilFamiliar — pertenencia a un titular', () => {
  it('varios perfiles pueden pertenecer al mismo titular', async () => {
    const padre = await crearPadre();
    await crearPerfilFamiliar({ titularId: padre._id, nombre: 'Hijo 1' });
    await crearPerfilFamiliar({ titularId: padre._id, nombre: 'Hijo 2' });

    const perfiles = await PerfilFamiliar.find({ titularId: padre._id });
    expect(perfiles).toHaveLength(2);
  });
});
