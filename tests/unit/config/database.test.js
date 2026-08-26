import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import connectDB from '../../../src/config/database.js';

describe('connectDB', () => {
  let connectSpy;
  let exitSpy;

  beforeEach(() => {
    connectSpy = vi.spyOn(mongoose, 'connect');
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    connectSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('conecta al primer intento sin reintentar', async () => {
    connectSpy.mockResolvedValueOnce(undefined);

    await connectDB(5, 10);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('reintenta tras un fallo pasajero y conecta antes de agotar los intentos', async () => {
    connectSpy
      .mockRejectedValueOnce(new Error('hipo de red'))
      .mockResolvedValueOnce(undefined);

    await connectDB(5, 10);

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('sale del proceso si agota todos los intentos sin conectar', async () => {
    connectSpy.mockRejectedValue(new Error('Mongo no disponible'));

    await connectDB(3, 10);

    expect(connectSpy).toHaveBeenCalledTimes(3);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
