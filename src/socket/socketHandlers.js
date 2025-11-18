import Notificacion from '../models/Notificacion.js';
import jwt from 'jsonwebtoken';

// Almacenar conexiones de usuarios
const usuariosConectados = new Map();

/**
 * Configurar Socket.IO
 */
export const setupSocketIO = (io) => {
  // Middleware de autenticación para Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Token no proporcionado'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
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

    // Guardar conexión
    if (!usuariosConectados.has(userId)) {
      usuariosConectados.set(userId, new Set());
    }
    usuariosConectados.get(userId).add(socket.id);

    // Unir a sala personal
    socket.join(`user:${userId}`);

    // Enviar conteo de notificaciones no leídas al conectarse
    try {
      const noLeidas = await Notificacion.contarNoLeidas(userId);
      socket.emit('notificaciones:conteo', { noLeidas });
    } catch (error) {
      console.error('Error al obtener conteo inicial:', error);
    }

    // Eventos del cliente

    // Cliente solicita notificaciones
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

    // Cliente marca notificación como leída
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

    // Cliente marca todas como leídas
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

    // Cliente elimina notificación
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

    // Desconexióm
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

/**
 * Emitir notificación a un usuario específico
 */
export const emitirNotificacion = async (notificacion) => {
  try {
    console.log(`\n [WEBSOCKET] Intentando emitir notificación`);
    console.log(`   ID: ${notificacion._id}`);
    console.log(`   Usuario: ${notificacion.usuarioId}`);
    
    const io = global.io;
    if (!io) {
      console.error(' Socket.IO no está inicializado en global.io');
      throw new Error('Socket.IO no está inicializado');
    }

    const userId = notificacion.usuarioId.toString();
    const roomName = `user:${userId}`;
    
    console.log(`   Room: ${roomName}`);
    console.log(`   Usuario conectado: ${estaUsuarioConectado(userId) ? 'SÍ' : 'NO'}`);

    // Emitir a todas las conexiones del usuario
    io.to(roomName).emit('notificaciones:nueva', {
      notificacion: notificacion.toObject ? notificacion.toObject() : notificacion
    });

    // Actualizar conteo
    const noLeidas = await Notificacion.contarNoLeidas(notificacion.usuarioId);
    io.to(roomName).emit('notificaciones:conteo', { noLeidas });

    console.log(`    Notificación emitida via WebSocket (${noLeidas} no leídas)`);
  } catch (error) {
    console.error(' Error al emitir notificación:', error);
    throw error;
  }
};

/**
 * Emitir a múltiples usuarios
 */
export const emitirNotificacionMultiple = async (notificaciones) => {
  const promesas = notificaciones.map(notif => emitirNotificacion(notif));
  await Promise.allSettled(promesas);
};

/**
 * Obtener usuarios conectados
 */
export const obtenerUsuariosConectados = () => {
  return Array.from(usuariosConectados.keys());
};

/**
 * Verificar si usuario está conectado
 */
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