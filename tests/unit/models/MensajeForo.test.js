import { describe, it, expect } from 'vitest';
import MensajeForo from '../../../src/models/MensajeForo.js';
import { crearMensajeForo, crearPadre } from '../../helpers/factories.js';

describe('MensajeForo — validaciones de schema', () => {
  it('requiere foroId, usuarioId y contenido', () => {
    const error = new MensajeForo({}).validateSync();
    expect(error.errors.foroId).toBeDefined();
    expect(error.errors.usuarioId).toBeDefined();
    expect(error.errors.contenido).toBeDefined();
  });

  it('rechaza contenido de más de 1500 caracteres', () => {
    const mensaje = new MensajeForo({
      foroId: '507f1f77bcf86cd799439011',
      usuarioId: '507f1f77bcf86cd799439012',
      contenido: 'x'.repeat(1501),
    });
    expect(mensaje.validateSync().errors.contenido).toBeDefined();
  });

  it('rechaza más de 5 archivos adjuntos', () => {
    const archivos = Array.from({ length: 6 }, (_, i) => ({
      url: `http://x.com/${i}.jpg`, publicId: `id${i}`, tipo: 'imagen', nombre: `${i}.jpg`,
    }));
    const mensaje = new MensajeForo({
      foroId: '507f1f77bcf86cd799439011', usuarioId: '507f1f77bcf86cd799439012', contenido: 'hola', archivos,
    });
    expect(mensaje.validateSync().errors.archivos).toBeDefined();
  });

  it('likes empieza en 0', () => {
    const mensaje = new MensajeForo({ foroId: '507f1f77bcf86cd799439011', usuarioId: '507f1f77bcf86cd799439012', contenido: 'hola' });
    expect(mensaje.likes).toBe(0);
  });
});

describe('MensajeForo — like/unlike', () => {
  it('toggleLike agrega el like la primera vez y lo quita la segunda', async () => {
    const mensaje = await crearMensajeForo();
    const usuario = await crearPadre();

    mensaje.toggleLike(usuario._id);
    expect(mensaje.likes).toBe(1);
    expect(mensaje.yaLeDioLike(usuario._id)).toBe(true);

    mensaje.toggleLike(usuario._id);
    expect(mensaje.likes).toBe(0);
    expect(mensaje.yaLeDioLike(usuario._id)).toBe(false);
  });

  it('yaLeDioLike es false para un usuario que nunca dio like', async () => {
    const mensaje = await crearMensajeForo();
    const otro = await crearPadre();
    expect(mensaje.yaLeDioLike(otro._id)).toBe(false);
  });
});
