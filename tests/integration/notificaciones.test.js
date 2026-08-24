import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Notificacion from '../../src/models/Notificacion.js';
import { crearPadre, crearAdministrador } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const crearNotifPara = (usuarioId, overrides = {}) =>
  Notificacion.create({ usuarioId, tipo: 'sistema', mensaje: 'Notificación de prueba', ...overrides });

describe('GET /api/notificaciones', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un usuario solo ve sus propias notificaciones', async () => {
    const padre = await crearPadre();
    const otro = await crearPadre();
    await crearNotifPara(padre._id);
    await crearNotifPara(otro._id);

    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/notificaciones');

    expect(res.status).toBe(200);
    expect(res.body.notificaciones).toHaveLength(1);
  });

  it('filtra por tipo y por leido', async () => {
    const padre = await crearPadre();
    await crearNotifPara(padre._id, { tipo: 'tarea', leido: false });
    await crearNotifPara(padre._id, { tipo: 'evento', leido: true });

    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/notificaciones?tipo=tarea&leido=false');

    expect(res.body.notificaciones).toHaveLength(1);
    expect(res.body.notificaciones[0].tipo).toBe('tarea');
  });
});

describe('GET /api/notificaciones/conteo-no-leidas', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('cuenta solo las no leídas del usuario autenticado', async () => {
    const padre = await crearPadre();
    await crearNotifPara(padre._id, { leido: false });
    await crearNotifPara(padre._id, { leido: false });
    await crearNotifPara(padre._id, { leido: true });

    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/notificaciones/conteo-no-leidas');
    expect(res.body.noLeidas).toBe(2);
  });
});

describe('POST /api/notificaciones — solo admin/superadmin', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('CORREGIDO: un padre no puede crear notificaciones dirigidas a otro usuario', async () => {
    const padre = await crearPadre();
    const victima = await crearPadre();
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/notificaciones').send({ usuarioId: victima._id.toString(), tipo: 'sistema', mensaje: 'Notificación falsa' });
    expect(res.status).toBe(403);
  });

  it('un administrador sí puede crear notificaciones', async () => {
    const admin = await crearAdministrador();
    const destinatario = await crearPadre();
    const agent = await loginComo(app, admin);

    const res = await agent.post('/api/notificaciones').send({ usuarioId: destinatario._id.toString(), tipo: 'sistema', mensaje: 'Aviso institucional' });
    expect(res.status).toBe(201);
  });
});

describe('Marcar como leída(s) / eliminar', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('marca una notificación propia como leída', async () => {
    const padre = await crearPadre();
    const notif = await crearNotifPara(padre._id, { leido: false });
    const agent = await loginComo(app, padre);

    const res = await agent.patch(`/api/notificaciones/${notif._id}/leer`);
    expect(res.status).toBe(200);
    expect((await Notificacion.findById(notif._id)).leido).toBe(true);
  });

  it('no puede marcar como leída una notificación de otro usuario', async () => {
    const padre = await crearPadre();
    const otro = await crearPadre();
    const notif = await crearNotifPara(otro._id, { leido: false });
    const agent = await loginComo(app, padre);

    const res = await agent.patch(`/api/notificaciones/${notif._id}/leer`);
    expect(res.status).toBe(404);
  });

  it('marca varias como leídas de una vez', async () => {
    const padre = await crearPadre();
    const a = await crearNotifPara(padre._id, { leido: false });
    const b = await crearNotifPara(padre._id, { leido: false });
    const agent = await loginComo(app, padre);

    const res = await agent.patch('/api/notificaciones/leer-multiples').send({ notificacionIds: [a._id.toString(), b._id.toString()] });
    expect(res.status).toBe(200);
    expect(res.body.modificadas).toBe(2);
  });

  it('marca todas como leídas', async () => {
    const padre = await crearPadre();
    await crearNotifPara(padre._id, { leido: false });
    await crearNotifPara(padre._id, { leido: false });
    const agent = await loginComo(app, padre);

    const res = await agent.patch('/api/notificaciones/leer-todas');
    expect(res.status).toBe(200);
    expect(res.body.noLeidas).toBe(0);
  });

  it('elimina una notificación propia', async () => {
    const padre = await crearPadre();
    const notif = await crearNotifPara(padre._id);
    const agent = await loginComo(app, padre);

    const res = await agent.delete(`/api/notificaciones/${notif._id}`);
    expect(res.status).toBe(200);
    expect(await Notificacion.findById(notif._id)).toBeNull();
  });

  it('limpia solo las leídas con más de N días de antigüedad', async () => {
    const padre = await crearPadre();
    const vieja = await crearNotifPara(padre._id, { leido: true, fecha: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });
    const reciente = await crearNotifPara(padre._id, { leido: true, fecha: new Date() });
    const agent = await loginComo(app, padre);

    const res = await agent.delete('/api/notificaciones/limpiar/antiguas?dias=30');
    expect(res.status).toBe(200);
    expect(res.body.eliminadas).toBe(1);
    expect(await Notificacion.findById(vieja._id)).toBeNull();
    expect(await Notificacion.findById(reciente._id)).not.toBeNull();
  });
});
