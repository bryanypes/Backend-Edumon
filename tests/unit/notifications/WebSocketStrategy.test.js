import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketStrategy } from '../../../src/notifications/strategies/WebSocketStrategy.js';
import { crearPadre } from '../../helpers/factories.js';
import Notificacion from '../../../src/models/Notificacion.js';

describe('WebSocketStrategy', () => {
  let ioOriginal;

  beforeEach(() => {
    ioOriginal = global.io;
  });

  afterEach(() => {
    global.io = ioOriginal;
  });

  it('nombre() es "websocket"', () => {
    expect(new WebSocketStrategy().nombre()).toBe('websocket');
  });

  it('devuelve false si global.io no está inicializado', async () => {
    global.io = undefined;
    const usuario = await crearPadre();
    const notificacion = await Notificacion.create({ usuarioId: usuario._id, tipo: 'sistema', mensaje: 'hola' });

    const resultado = await new WebSocketStrategy().enviar(usuario, notificacion);
    expect(resultado).toBe(false);
  });

  it('emite la notificación y el conteo a la sala user:<id>, y devuelve true', async () => {
    const emitMock = vi.fn();
    const toMock = vi.fn(() => ({ emit: emitMock }));
    global.io = { to: toMock, emit: vi.fn() };

    const usuario = await crearPadre();
    const notificacion = await Notificacion.create({ usuarioId: usuario._id, tipo: 'tarea', mensaje: 'Nueva tarea' });

    const resultado = await new WebSocketStrategy().enviar(usuario, notificacion);

    expect(resultado).toBe(true);
    expect(toMock).toHaveBeenCalledWith(`user:${usuario._id}`);
    expect(emitMock).toHaveBeenCalledWith('notificaciones:nueva', expect.objectContaining({
      notificacion: expect.objectContaining({ mensaje: 'Nueva tarea' }),
    }));
    expect(emitMock).toHaveBeenCalledWith('notificaciones:conteo', expect.objectContaining({ noLeidas: expect.any(Number) }));
  });

  it('devuelve false (sin lanzar) si io.to() lanza un error', async () => {
    global.io = {
      to: () => { throw new Error('socket roto'); },
      emit: vi.fn(),
    };
    const usuario = await crearPadre();
    const notificacion = await Notificacion.create({ usuarioId: usuario._id, tipo: 'sistema', mensaje: 'hola' });

    const resultado = await new WebSocketStrategy().enviar(usuario, notificacion);
    expect(resultado).toBe(false);
  });
});
