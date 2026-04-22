import admin from 'firebase-admin';
import User from '../../models/User.js';
import { NotificacionStrategy } from './NotificacionStrategy.js';

/**
 * Estrategia concreta: Firebase Cloud Messaging (Push)
 */
export class FCMStrategy extends NotificacionStrategy {
  nombre() { return 'push'; }

  async enviar(usuario, notificacion) {
    if (!usuario.fcmToken) return false;

    const titulos = {
      tarea: '📝 Nueva Tarea',
      entrega: '📤 Nueva Entrega',
      calificacion: '⭐ Calificación',
      foro: '💬 Foro',
      evento: '📅 Nuevo Evento',
      sistema: '🔔 Notificación'
    };

    const message = {
      token: usuario.fcmToken,
      notification: {
        title: titulos[notificacion.tipo] || '🔔 Notificación',
        body: notificacion.mensaje
      },
      data: {
        notificacionId: notificacion._id.toString(),
        tipo: notificacion.tipo,
        url: `/notificaciones`
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } }
    };

    try {
      await admin.messaging().send(message);
      return true;
    } catch (error) {
      // Token expirado — limpiar
      if (error.code === 'messaging/registration-token-not-registered') {
        await User.findByIdAndUpdate(usuario._id, { fcmToken: null });
      }
      console.error('[FCMStrategy] Error:', error.message);
      return false;
    }
  }
}