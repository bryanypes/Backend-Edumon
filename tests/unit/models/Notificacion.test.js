import { describe, it, expect } from 'vitest';
import Notificacion from '../../../src/models/Notificacion.js';
import { crearPadre } from '../../helpers/factories.js';

const crearNotificacion = async (usuarioId, overrides = {}) =>
  Notificacion.create({
    usuarioId,
    tipo: 'sistema',
    mensaje: 'Mensaje de prueba',
    ...overrides,
  });

describe('Notificacion — validaciones de schema', () => {
  it('requiere usuarioId, tipo y mensaje', () => {
    const error = new Notificacion({}).validateSync();
    expect(error.errors.usuarioId).toBeDefined();
    expect(error.errors.tipo).toBeDefined();
    expect(error.errors.mensaje).toBeDefined();
  });

  it('rechaza un tipo fuera del enum', () => {
    const notif = new Notificacion({ usuarioId: '507f1f77bcf86cd799439011', tipo: 'invalido', mensaje: 'hola' });
    expect(notif.validateSync().errors.tipo).toBeDefined();
  });

  it('leido por defecto es false y prioridad por defecto es "media"', () => {
    const notif = new Notificacion({ usuarioId: '507f1f77bcf86cd799439011', tipo: 'sistema', mensaje: 'hola' });
    expect(notif.leido).toBe(false);
    expect(notif.prioridad).toBe('media');
  });

  it('rechaza un mensaje de más de 500 caracteres', () => {
    const notif = new Notificacion({ usuarioId: '507f1f77bcf86cd799439011', tipo: 'sistema', mensaje: 'x'.repeat(501) });
    expect(notif.validateSync().errors.mensaje).toBeDefined();
  });
});

describe('Notificacion — virtual esReciente', () => {
  it('es true para una notificación de hace unos minutos', async () => {
    const padre = await crearPadre();
    const notif = await crearNotificacion(padre._id, { fecha: new Date(Date.now() - 5 * 60 * 1000) });
    expect(notif.esReciente).toBe(true);
  });

  it('es false para una notificación de hace más de 24 horas', async () => {
    const padre = await crearPadre();
    const notif = await crearNotificacion(padre._id, { fecha: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    expect(notif.esReciente).toBe(false);
  });
});

describe('Notificacion — statics', () => {
  it('contarNoLeidas cuenta solo las no leídas del usuario', async () => {
    const padre = await crearPadre();
    const otro = await crearPadre();
    await crearNotificacion(padre._id, { leido: false });
    await crearNotificacion(padre._id, { leido: false });
    await crearNotificacion(padre._id, { leido: true });
    await crearNotificacion(otro._id, { leido: false });

    expect(await Notificacion.contarNoLeidas(padre._id)).toBe(2);
  });

  it('marcarTodasLeidas marca todas las no leídas del usuario y no toca las de otros', async () => {
    const padre = await crearPadre();
    const otro = await crearPadre();
    await crearNotificacion(padre._id, { leido: false });
    await crearNotificacion(padre._id, { leido: false });
    await crearNotificacion(otro._id, { leido: false });

    await Notificacion.marcarTodasLeidas(padre._id);

    expect(await Notificacion.contarNoLeidas(padre._id)).toBe(0);
    expect(await Notificacion.contarNoLeidas(otro._id)).toBe(1);
  });

  it('marcarVariasLeidas solo marca los IDs indicados y solo si son del usuario', async () => {
    const padre = await crearPadre();
    const a = await crearNotificacion(padre._id, { leido: false });
    const b = await crearNotificacion(padre._id, { leido: false });
    const c = await crearNotificacion(padre._id, { leido: false });

    await Notificacion.marcarVariasLeidas(padre._id, [a._id, b._id]);

    expect((await Notificacion.findById(a._id)).leido).toBe(true);
    expect((await Notificacion.findById(b._id)).leido).toBe(true);
    expect((await Notificacion.findById(c._id)).leido).toBe(false);
  });

  it('obtenerNoLeidas devuelve solo las no leídas ordenadas por fecha descendente', async () => {
    const padre = await crearPadre();
    await crearNotificacion(padre._id, { leido: true });
    const masVieja = await crearNotificacion(padre._id, { leido: false, fecha: new Date(Date.now() - 10000) });
    const masReciente = await crearNotificacion(padre._id, { leido: false, fecha: new Date() });

    const resultado = await Notificacion.obtenerNoLeidas(padre._id);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]._id.toString()).toBe(masReciente._id.toString());
    expect(resultado[1]._id.toString()).toBe(masVieja._id.toString());
  });
});
