import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import crearApp from '../../src/app.js';
import Notificacion from '../../src/models/Notificacion.js';
import { generarAccessToken } from '../../src/controllers/authController.js';
import { crearPadre } from '../helpers/factories.js';

let server;
let baseUrl;
const sockets = [];

const conectar = (token) => {
  const socket = ioClient(baseUrl, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return socket;
};

const esperarEvento = (socket, evento, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout esperando "${evento}"`)), timeoutMs);
    socket.once(evento, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

beforeEach(async () => {
  ({ server } = crearApp());
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close());
  await new Promise((resolve) => server.close(resolve));
});

describe('Autenticación del handshake de Socket.IO', () => {
  it('conecta y recibe el conteo inicial de no leídas con un token válido', async () => {
    const padre = await crearPadre();
    await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'Pendiente 1' });
    await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'Pendiente 2', leido: true });

    const token = generarAccessToken(padre);
    const socket = conectar(token);

    const conteo = await esperarEvento(socket, 'notificaciones:conteo');
    expect(conteo.noLeidas).toBe(1);
  });

  it('rechaza la conexión sin token', async () => {
    const socket = conectar(null);
    await expect(new Promise((resolve, reject) => {
      socket.on('connect_error', (err) => resolve(err));
      socket.on('connect', () => reject(new Error('no debería conectar')));
    })).resolves.toBeTruthy();
  });

  it('rechaza la conexión con un token inválido', async () => {
    const socket = conectar('token-falso-invalido');
    const err = await new Promise((resolve, reject) => {
      socket.on('connect_error', (e) => resolve(e));
      socket.on('connect', () => reject(new Error('no debería conectar')));
    });
    expect(err.message).toMatch(/inválido/i);
  });
});

describe('Eventos de notificaciones sobre el socket', () => {
  it('notificaciones:solicitar devuelve la lista paginada del usuario', async () => {
    const padre = await crearPadre();
    await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'Una notificación' });

    const socket = conectar(generarAccessToken(padre));
    await esperarEvento(socket, 'notificaciones:conteo');

    socket.emit('notificaciones:solicitar', { page: 1, limit: 20 });
    const respuesta = await esperarEvento(socket, 'notificaciones:lista');

    expect(respuesta.notificaciones).toHaveLength(1);
  });

  it('notificaciones:marcar-leida actualiza el conteo y emite la notificación actualizada', async () => {
    const padre = await crearPadre();
    const notif = await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'Por leer', leido: false });

    const socket = conectar(generarAccessToken(padre));
    await esperarEvento(socket, 'notificaciones:conteo');

    socket.emit('notificaciones:marcar-leida', { notificacionId: notif._id.toString() });
    const actualizada = await esperarEvento(socket, 'notificaciones:actualizada');

    expect(actualizada.notificacion.leido).toBe(true);
    expect((await Notificacion.findById(notif._id)).leido).toBe(true);
  });

  it('un usuario no puede marcar como leída la notificación de otro (no la encuentra, no rompe)', async () => {
    const padre = await crearPadre();
    const otro = await crearPadre();
    const notifDeOtro = await Notificacion.create({ usuarioId: otro._id, tipo: 'sistema', mensaje: 'Ajena', leido: false });

    const socket = conectar(generarAccessToken(padre));
    await esperarEvento(socket, 'notificaciones:conteo');

    socket.emit('notificaciones:marcar-leida', { notificacionId: notifDeOtro._id.toString() });
    // No debe llegar "notificaciones:actualizada" porque el findOneAndUpdate no encontró nada (usuarioId no coincide)
    await expect(esperarEvento(socket, 'notificaciones:actualizada', 300)).rejects.toThrow();
    expect((await Notificacion.findById(notifDeOtro._id)).leido).toBe(false);
  });

  it('notificaciones:marcar-todas-leidas deja el conteo en 0', async () => {
    const padre = await crearPadre();
    await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'A', leido: false });
    await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'B', leido: false });

    const socket = conectar(generarAccessToken(padre));
    await esperarEvento(socket, 'notificaciones:conteo');

    socket.emit('notificaciones:marcar-todas-leidas');
    const conteo = await esperarEvento(socket, 'notificaciones:conteo');
    expect(conteo.noLeidas).toBe(0);
  });

  it('notificaciones:eliminar borra la notificación y actualiza el conteo', async () => {
    const padre = await crearPadre();
    const notif = await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'A borrar', leido: false });

    const socket = conectar(generarAccessToken(padre));
    await esperarEvento(socket, 'notificaciones:conteo');

    socket.emit('notificaciones:eliminar', { notificacionId: notif._id.toString() });
    const eliminada = await esperarEvento(socket, 'notificaciones:eliminada');

    expect(eliminada.notificacionId).toBe(notif._id.toString());
    expect(await Notificacion.findById(notif._id)).toBeNull();
  });
});

describe('Entrega de notificaciones en vivo (extremo a extremo)', () => {
  it('un padre conectado recibe "notificaciones:nueva" cuando el NotificadorFacade le notifica', async () => {
    const padre = await crearPadre();
    const socket = conectar(generarAccessToken(padre));
    await esperarEvento(socket, 'notificaciones:conteo');

    const nuevaPromesa = esperarEvento(socket, 'notificaciones:nueva');

    const notificador = (await import('../../src/notifications/NotificadorFacade.js')).default;
    await notificador.notificar(padre._id, { tipo: 'tarea', mensaje: 'Tienes una tarea nueva' });

    const evento = await nuevaPromesa;
    expect(evento.notificacion.mensaje).toBe('Tienes una tarea nueva');
  });
});
