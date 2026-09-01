import nodemailer from "nodemailer";

// Transporte SMTP singleton — se crea una sola vez y se reutiliza en cada
// envío (evita reabrir conexión/autenticar contra el servidor de correo de
// la universidad en cada llamada).
let transporte = null;

export function getTransportSMTP() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      // true = SSL directo (puerto 465). false = STARTTLS (puerto 587/25),
      // el caso más común en servidores institucionales.
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporte;
}
