import { describe, it, expect } from 'vitest';
import Buzon from '../../../src/models/Buzon.js';
import { crearMensajeBuzon } from '../../helpers/factories.js';

describe('Buzon — validaciones de schema', () => {
  it('requiere nombre, correo y mensaje', () => {
    const error = new Buzon({}).validateSync();
    expect(error.errors.nombre).toBeDefined();
    expect(error.errors.correo).toBeDefined();
    expect(error.errors.mensaje).toBeDefined();
  });

  // El formulario público (landing) marca teléfono e institución como
  // opcionales — el schema no debe exigirlos.
  it('acepta un mensaje sin telefono ni institucion', () => {
    const error = new Buzon({ nombre: 'A', correo: 'a@test.com', mensaje: 'Mensaje de prueba válido' }).validateSync();
    expect(error).toBeUndefined();
  });

  it('rechaza un mensaje de menos de 10 caracteres', () => {
    const mensaje = new Buzon({ nombre: 'A', correo: 'a@test.com', telefono: '3000000000', mensaje: 'corto' });
    expect(mensaje.validateSync().errors.mensaje).toBeDefined();
  });

  it('rechaza un mensaje de más de 1000 caracteres', () => {
    const mensaje = new Buzon({ nombre: 'A', correo: 'a@test.com', telefono: '3000000000', mensaje: 'x'.repeat(1001) });
    expect(mensaje.validateSync().errors.mensaje).toBeDefined();
  });

  it('leido por defecto es false', async () => {
    const mensaje = await crearMensajeBuzon();
    expect(mensaje.leido).toBe(false);
  });

  it('normaliza el correo a minúsculas', async () => {
    const mensaje = await crearMensajeBuzon({ correo: 'MAYUSCULA@TEST.COM' });
    expect(mensaje.correo).toBe('mayuscula@test.com');
  });
});
