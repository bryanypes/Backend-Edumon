import axios from "axios";

function generarHTMLRecuperacion(usuario, codigo) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #F8FAFC; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #fff; text-align: center; padding: 25px; border-radius: 12px 12px 0 0; }
  .title { color: #0082B3; font-size: 22px; font-weight: bold; }
  .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
  .codigo { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0082B3; text-align: center; margin: 24px 0; }
  .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 12px 12px; }
</style></head>
<body><div class="container">
  <div class="header"><h1 class="title">Edumon</h1></div>
  <div class="content">
    <p>Hola <strong>${usuario.nombre}</strong>,</p>
    <p>Recibimos una solicitud para restablecer tu contraseña. Tu código de verificación es:</p>
    <div class="codigo">${codigo}</div>
    <p>Expira en <strong>15 minutos</strong>. Si no lo solicitaste, ignora este mensaje.</p>
  </div>
  <div class="footer"><p>&copy; ${new Date().getFullYear()} Edumon</p></div>
</div></body></html>`;
}

export async function enviarCorreoRecuperacion(usuario, codigo) {
  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: 'onboarding@resend.dev',
        to: [usuario.correo],
        subject: '🔐 Código de recuperación de contraseña',
        html: generarHTMLRecuperacion(usuario, codigo)
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return true;
  } catch (error) {
    console.error('[mailService] Error enviando recuperación:', error.response?.data || error.message);
    throw error;
  }
}