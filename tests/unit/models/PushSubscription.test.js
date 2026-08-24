import { describe, it, expect } from 'vitest';
import PushSubscription from '../../../src/models/PushSubscription.js';
import { crearPadre } from '../../helpers/factories.js';

describe('PushSubscription — validaciones de schema', () => {
  it('requiere usuarioId, endpoint, keys.p256dh y keys.auth', () => {
    const error = new PushSubscription({}).validateSync();
    expect(error.errors.usuarioId).toBeDefined();
    expect(error.errors.endpoint).toBeDefined();
    expect(error.errors['keys.p256dh']).toBeDefined();
    expect(error.errors['keys.auth']).toBeDefined();
  });

  it('activa por defecto es true', () => {
    const sub = new PushSubscription({
      usuarioId: '507f1f77bcf86cd799439011',
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'x', auth: 'y' },
    });
    expect(sub.activa).toBe(true);
  });
});

describe('PushSubscription — índice único de endpoint', () => {
  it('rechaza dos suscripciones con el mismo endpoint', async () => {
    const padre = await crearPadre();
    const endpoint = 'https://push.example.com/mismo-endpoint';
    await PushSubscription.create({ usuarioId: padre._id, endpoint, keys: { p256dh: 'x', auth: 'y' } });
    await expect(
      PushSubscription.create({ usuarioId: padre._id, endpoint, keys: { p256dh: 'x2', auth: 'y2' } }),
    ).rejects.toThrow();
  });
});

describe('PushSubscription — actualizarUso', () => {
  it('actualiza ultimoUso y persiste el cambio', async () => {
    const padre = await crearPadre();
    const sub = await PushSubscription.create({
      usuarioId: padre._id,
      endpoint: 'https://push.example.com/otro',
      keys: { p256dh: 'x', auth: 'y' },
      ultimoUso: new Date(Date.now() - 100000),
    });
    const antes = sub.ultimoUso;

    await sub.actualizarUso();

    expect(sub.ultimoUso.getTime()).toBeGreaterThan(antes.getTime());
    const recargada = await PushSubscription.findById(sub._id);
    expect(recargada.ultimoUso.getTime()).toBe(sub.ultimoUso.getTime());
  });
});
