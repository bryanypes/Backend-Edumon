import { getTransportSMTP } from '../../services/smtpTransport.js';
import { NotificacionStrategy } from './NotificacionStrategy.js';


export class EmailStrategy extends NotificacionStrategy {
  nombre() { return 'email'; }

  async enviar(usuario, notificacion) {
    if (!usuario.correo) return false;
    if (!process.env.SMTP_HOST) return false;

    const titulos = {
      tarea: '📝 Nueva Tarea',
      entrega: '📤 Nueva Entrega',
      calificacion: '⭐ Calificación',
      foro: '💬 Foro',
      evento: '📅 Nuevo Evento',
      sistema: '🔔 Notificación'
    };

    try {
      const transporte = getTransportSMTP();
      await transporte.sendMail({
        from: {
          name:    process.env.SMTP_FROM_NAME || 'Edumon',
          address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        },
        to: { name: usuario.nombre, address: usuario.correo },
        subject: titulos[notificacion.tipo] || 'Notificación Edumon',
        html: this._generarHTML(usuario, notificacion)
      });
      return true;
    } catch (error) {
      console.error('[EmailStrategy] Error:', error.message);
      return false;
    }
  }

  _generarHTML(usuario, notificacion) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #F8FAFC; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #fff; text-align: center; padding: 25px; border-radius: 12px 12px 0 0; }
  .title { color: #0082B3; font-size: 22px; font-weight: bold; }
  .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
  .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 12px 12px; }
</style></head>
<body><div class="container">
  <div class="header"><h1 class="title">Edumon</h1></div>
  <div class="content">
    <p>Hola <strong>${usuario.nombre}</strong>,</p>
    <p>${notificacion.mensaje}</p>
  </div>
  <div class="footer"><p>&copy; ${new Date().getFullYear()} Edumon</p></div>
</div></body></html>`;
  }
}