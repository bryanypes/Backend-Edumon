import { getTransportSMTP } from '../../services/smtpTransport.js';
import { NotificacionStrategy } from './NotificacionStrategy.js';
import { esCorreoFicticio } from '../../utils/correo.js';
import { correoNotificacion } from '../../services/plantillaCorreo.js';


export class EmailStrategy extends NotificacionStrategy {
  nombre() { return 'email'; }

  async enviar(usuario, notificacion) {
    // sin correo real (los de relleno como "<cédula>@temp.com" no existen)
    if (esCorreoFicticio(usuario.correo)) return false;
    if (!process.env.SMTP_HOST) return false;

    try {
      const transporte = getTransportSMTP();
      const { subject, html, text } = correoNotificacion(usuario, notificacion);
      await transporte.sendMail({
        from: {
          name:    process.env.SMTP_FROM_NAME || 'Edumon',
          address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        },
        to: { name: usuario.nombre, address: usuario.correo },
        subject,
        html,
        text,
      });
      return true;
    } catch (error) {
      console.error('[EmailStrategy] Error:', error.message);
      return false;
    }
  }
}
