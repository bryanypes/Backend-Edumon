import { getTransportSMTP } from "./smtpTransport.js";
import { correoRecuperacion } from "./plantillaCorreo.js";

export async function enviarCorreoRecuperacion(usuario, codigo) {
  try {
    const transporte = getTransportSMTP();
    const { subject, html, text } = correoRecuperacion(usuario, codigo);
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
    console.error('[mailService] Error enviando recuperación:', error.message);
    throw error;
  }
}