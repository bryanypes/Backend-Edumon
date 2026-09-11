import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Raíz del almacenamiento local de archivos subidos (fotos, adjuntos, APK).
// En Docker se monta un volumen persistente y se define UPLOAD_DIR=/data/uploads.
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

// Prefijo público bajo el que se sirven los archivos no privados.
export const PUBLIC_PREFIX = '/uploads';

// Los archivos privados viven bajo esta subcarpeta; se sirven solo con sesión.
export const CARPETA_PRIVADA = 'priv';
export const CARPETA_PUBLICA = 'pub';

// Avatares predeterminados: se empaquetan con la imagen, no en el volumen.
export const AVATARES_DIR = path.join(
  fileURLToPath(new URL('../uploads/fotos-predeterminadas/', import.meta.url)),
);
export const AVATARES_PREFIX = '/static/avatares';

// No debe ser fatal: esto corre al importar el módulo, antes de app.listen().
// Si UPLOAD_DIR (el volumen montado) tiene permisos incorrectos, un mkdirSync
// que lanza aquí tumba TODO el proceso antes de abrir el puerto — nginx ve
// "connection refused" y responde 502 en cualquier ruta, no solo en subidas.
// Con el try/catch, el servidor arranca igual; cada escritura real (en
// cloudinaryUpload.js) reintenta el mkdir y devuelve un error 500/503 normal
// solo en esa petición si el problema persiste.
for (const dir of [
  path.join(UPLOAD_DIR, CARPETA_PUBLICA),
  path.join(UPLOAD_DIR, CARPETA_PRIVADA),
]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(
      `[almacenamiento] No se pudo crear "${dir}": ${error.message}. ` +
      'Verifica los permisos de UPLOAD_DIR (el volumen montado debe ser escribible por el usuario "node"). ' +
      'El servidor sigue arrancando; las subidas de archivos fallarán hasta que se corrija.',
    );
  }
}
