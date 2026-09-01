import Notificacion from '../models/Notificacion.js';
import jwt from 'jsonwebtoken';

const usuariosConectados = new Map();

// socket.io no trae cookie-parser: el header llega como string crudo sin parsear
const getCookieValue = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

export const setupSocketIO = (io) => {
  io.use(async (socket, next) => {
    try {
      // el frontend web solo tiene cookie httpOnly, sin JWT accesible en JS;
      // auth.token/Authorization se mantienen para clientes como Flutter
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(' ')[1] ||
        getCookieValue(socket.handshake.headers.cookie, 'access_token');

      if (!token) {
        return next(new Error('Token no proporcionado'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.rol;
      
      next();
    } catch (error) {
      console.error('Error de autenticación en Socket:', error);
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`Usuario conectado: ${userId}`);

    if (!usuariosConectados.has(userId)) {
      usuariosConectados.set(userId, new Set());
    }
    usuariosConectados.get(userId).add(socket.id);

    socket.join(`user:${userId}`);

    try {
      const noLeidas = await Notificacion.contarNoLeidas(userId);
      socket.emit('notificaciones:conteo', { noLeidas });
    } catch (error) {
      console.error('Error al obtener conteo inicial:', error);
    }

    socket.on('notificaciones:solicitar', async (data) => {
      try {
        const { page = 1, limit = 20 } = data;
        const skip = (page - 1) * limit;

        const notificaciones = await Notificacion.find({ usuarioId: userId })
          .sort({ fecha: -1 })
          .skip(skip)
          .limit(limit)
          .populate('referenciaId')
          .lean();

        socket.emit('notificaciones:lista', { notificaciones, page });
      } catch (error) {
        console.error('Error al solicitar notificaciones:', error);
        socket.emit('notificaciones:error', { mensaje: 'Error al cargar notificaciones' });
      }
    });

    socket.on('notificaciones:marcar-leida', async (data) => {
      try {
        const { notificacionId } = data;

        const notificacion = await Notificacion.findOneAndUpdate(
          { _id: notificacionId, usuarioId: userId },
          { leido: true },
          { new: true }
        );

        if (notificacion) {
          const noLeidas = await Notificacion.contarNoLeidas(userId);
          socket.emit('notificaciones:conteo', { noLeidas });
          socket.emit('notificaciones:actualizada', { notificacion });
        }
      } catch (error) {
        console.error('Error al marcar como leída:', error);
        socket.emit('notificaciones:error', { mensaje: 'Error al actualizar notificación' });
      }
    });

    socket.on('notificaciones:marcar-todas-leidas', async () => {
      try {
        await Notificacion.marcarTodasLeidas(userId);
        socket.emit('notificaciones:conteo', { noLeidas: 0 });
        socket.emit('notificaciones:todas-leidas');
      } catch (error) {
        console.error('Error al marcar todas como leídas:', error);
        socket.emit('notificaciones:error', { mensaje: 'Error al actualizar notificaciones' });
      }
    });

    socket.on('notificaciones:eliminar', async (data) => {
      try {
        const { notificacionId } = data;

        await Notificacion.findOneAndDelete({
          _id: notificacionId,
          usuarioId: userId
        });

        const noLeidas = await Notificacion.contarNoLeidas(userId);
        socket.emit('notificaciones:conteo', { noLeidas });
        socket.emit('notificaciones:eliminada', { notificacionId });
      } catch (error) {
        console.error('Error al eliminar notificación:', error);
        socket.emit('notificaciones:error', { mensaje: 'Error al eliminar notificación' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${userId}`);
      
      const sockets = usuariosConectados.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          usuariosConectados.delete(userId);
        }
      }
    });
  });

  return io;
};

export const emitirNotificacion = async (notificacion) => {
  try {
    const io = global.io;
    if (!io) {
      throw new Error('Socket.IO no está inicializado');
    }

    const userId = notificacion.usuarioId.toString();
    const roomName = `user:${userId}`;

    io.to(roomName).emit('notificaciones:nueva', {
      notificacion: notificacion.toObject ? notificacion.toObject() : notificacion
    });

    const noLeidas = await Notificacion.contarNoLeidas(notificacion.usuarioId);
    io.to(roomName).emit('notificaciones:conteo', { noLeidas });
  } catch (error) {
    console.error('Error al emitir notificación:', error);
    throw error;
  }
};

export const emitirNotificacionMultiple = async (notificaciones) => {
  const promesas = notificaciones.map(notif => emitirNotificacion(notif));
  await Promise.allSettled(promesas);
};

export const obtenerUsuariosConectados = () => {
  return Array.from(usuariosConectados.keys());
};

export const estaUsuarioConectado = (userId) => {
  return usuariosConectados.has(userId);
};

export default {
  setupSocketIO,
  emitirNotificacion,
  emitirNotificacionMultiple,
  obtenerUsuariosConectados,
  estaUsuarioConectado
};