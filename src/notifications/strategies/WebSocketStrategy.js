import { NotificacionStrategy } from './NotificacionStrategy.js';
import Notificacion from '../../models/Notificacion.js';

/**
 * Estrategia concreta: WebSocket via Socket.IO
 */
export class WebSocketStrategy extends NotificacionStrategy {
  nombre() { return 'websocket'; }

  async enviar(usuario, notificacion) {
    try {
      const io = global.io;
      if (!io) return false;

      const userId = usuario._id.toString();
      const room = `user:${userId}`;

      io.to(room).emit('notificaciones:nueva', {
        notificacion: notificacion.toObject ? notificacion.toObject() : notificacion
      });

      const noLeidas = await Notificacion.contarNoLeidas(usuario._id);
      io.to(room).emit('notificaciones:conteo', { noLeidas });

      return true;
    } catch (error) {
      console.error('[WebSocketStrategy] Error:', error.message);
      return false;
    }
  }
}