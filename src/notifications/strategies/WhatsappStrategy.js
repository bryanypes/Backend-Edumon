// src/notifications/strategies/WhatsAppStrategy.js
import twilio from 'twilio';
import { NotificacionStrategy } from './NotificacionStrategy.js';

/**
 * Estrategia concreta: WhatsApp via Twilio
 */
export class WhatsAppStrategy extends NotificacionStrategy {
  constructor() {
    super();
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  nombre() { return 'whatsapp'; }

  async enviar(usuario, notificacion) {
    if (!usuario.telefono) return false;

    const titulos = {
      tarea: '📝 Nueva Tarea',
      entrega: '📤 Nueva Entrega',
      calificacion: '⭐ Calificación',
      foro: '💬 Foro',
      evento: '📅 Nuevo Evento',
      sistema: '🔔 Notificación'
    };

    try {
      await this.client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${usuario.telefono}`,
        body: `🔔 *${titulos[notificacion.tipo] || 'Notificación'}*\n\n${notificacion.mensaje}\n\n_Edumon_`
      });
      return true;
    } catch (error) {
      console.error('[WhatsAppStrategy] Error:', error.message);
      return false;
    }
  }
}