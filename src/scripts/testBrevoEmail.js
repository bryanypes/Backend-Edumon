// Envía un correo de prueba usando la integración real de Brevo (mailService.js)
// para verificar que las credenciales BREVO_* del .env funcionan.
//
// Uso: npm run test:email -- correo-destino@ejemplo.com
import dotenv from 'dotenv';
dotenv.config();

import { enviarCorreoRecuperacion } from '../services/mailService.js';

const correoDestino = process.argv[2];

if (!correoDestino) {
  console.error('Uso: npm run test:email -- correo-destino@ejemplo.com');
  process.exit(1);
}

const codigoDePrueba = '123456';

try {
  await enviarCorreoRecuperacion({ correo: correoDestino, nombre: 'Prueba' }, codigoDePrueba);
  console.log(`✅ Correo de prueba enviado a ${correoDestino} (código: ${codigoDePrueba})`);
} catch (error) {
  console.error('❌ Error enviando el correo de prueba:', error.message);
  process.exit(1);
}
