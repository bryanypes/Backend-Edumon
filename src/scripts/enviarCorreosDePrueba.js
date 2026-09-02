// Envía UNA vez cada tipo de correo que el sistema puede mandar, usando la
// integración real de SMTP, para revisar plantillas y comprobar que las
// credenciales SMTP_* del .env funcionan.
//
// Correos: recuperación de contraseña + una notificación por cada tipo
// (tarea, entrega, calificación, foro, evento, sistema).
//
// Uso:
//   node src/scripts/enviarCorreosDePrueba.js
//   node src/scripts/enviarCorreosDePrueba.js otro-correo@ejemplo.com
import dotenv from 'dotenv';
dotenv.config();

import { enviarCorreoRecuperacion } from '../services/mailService.js';
import { EmailStrategy } from '../notifications/strategies/EmailStrategy.js';

const DESTINO = process.argv[2] || 'karen.mancilla.s@uniautonoma.edu.co';
const usuario = { nombre: 'Karen', correo: DESTINO };

const notificaciones = [
  { tipo: 'tarea',        mensaje: 'Nueva tarea: "Taller de fracciones". Entrega: 15 de septiembre de 2026, 11:59 PM' },
  { tipo: 'entrega',      mensaje: 'Sofía Ramírez entregó "Taller de fracciones". Ya puedes calificarla.' },
  { tipo: 'calificacion', mensaje: '"Taller de fracciones" fue calificada por el docente Andrés Gómez. Valoración: 5/5' },
  { tipo: 'foro',         mensaje: 'El docente Andrés Gómez publicó en el foro "Dudas de la Unidad 1"' },
  { tipo: 'evento',       mensaje: 'Nuevo evento: "Escuela de Padres" — 12 de septiembre de 2026 a las 17:00' },
  { tipo: 'sistema',      mensaje: '¡Bienvenido a Edumon! Usa tu cédula como contraseña.' },
];

if (!process.env.SMTP_HOST) {
  console.error('❌ Falta SMTP_HOST en el .env');
  process.exit(1);
}

const email = new EmailStrategy();
let enviados = 0;
let fallidos = 0;

try {
  await enviarCorreoRecuperacion(usuario, '482913');
  console.log('✅ recuperación de contraseña');
  enviados++;
} catch (error) {
  console.error('❌ recuperación de contraseña:', error.message);
  fallidos++;
}

for (const notificacion of notificaciones) {
  const ok = await email.enviar(usuario, notificacion);
  if (ok) {
    console.log(`✅ notificación: ${notificacion.tipo}`);
    enviados++;
  } else {
    console.error(`❌ notificación: ${notificacion.tipo}`);
    fallidos++;
  }
}

console.log(`\n${enviados} enviado(s), ${fallidos} fallido(s) → ${DESTINO}`);
process.exit(fallidos ? 1 : 0);
