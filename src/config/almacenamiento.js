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

for (const dir of [
  path.join(UPLOAD_DIR, CARPETA_PUBLICA),
  path.join(UPLOAD_DIR, CARPETA_PRIVADA),
]) {
  fs.mkdirSync(dir, { recursive: true });
}
