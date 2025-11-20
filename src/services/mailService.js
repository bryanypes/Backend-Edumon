import axios from "axios";
import generarHTMLEmail from "../utils/generarHTMLEmail.js"; // si está en otro lado, ajusta la ruta

export async function enviarCorreo(usuario, notificacion) {
  try {
    const response = await axios.post(
      "https://api.mailersend.com/v1/email",
      {
        from: { email: "notificaciones@tudominio.com" }, // <-- CAMBIAR
        to: [{ email: usuario.email }],
        subject: notificacion.titulo || "Notificación",
        html: generarHTMLEmail(usuario, notificacion)
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error("❌ Error API Mailersend:", error.response?.data || error);
    throw error;
  }
}
