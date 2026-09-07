// Almacenamiento local de archivos. Mantiene la firma pública que antes
// implementaba Cloudinary (subirImagen/subirArchivo/firmarUrl/eliminar) para no
// tocar los controladores; ahora escribe a disco bajo UPLOAD_DIR.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  UPLOAD_DIR,
  PUBLIC_PREFIX,
  CARPETA_PRIVADA,
  CARPETA_PUBLICA,
} from '../config/almacenamiento.js';

const MAX_ANCHO_IMAGEN = 1600;
const CALIDAD_IMAGEN = 80;

const EXT_POR_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
};

const extDeMime = (mimetype = '') => EXT_POR_MIME[mimetype] || '';

// mimetype -> categoría (se conserva para compatibilidad con los controladores)
export const resourceTypeDeMime = (mimetype = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
};

const slug = (nombre = 'archivo') =>
  path.parse(nombre).name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60) || 'archivo';

const nombreUnico = (originalName, ext) =>
  `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${slug(originalName)}${ext}`;

// Evita que un publicId con "../" escape de UPLOAD_DIR.
const rutaSegura = (publicId) => {
  const destino = path.resolve(UPLOAD_DIR, publicId);
  if (destino !== UPLOAD_DIR && !destino.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error('Ruta de archivo inválida');
  }
  return destino;
};

// Redimensiona y comprime imágenes rasterizadas a webp; el resto pasa igual.
const optimizarImagen = async (buffer, mimetype) => {
  const optimizables = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!optimizables.includes(mimetype)) return { buffer, ext: extDeMime(mimetype) };
  try {
    const salida = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_ANCHO_IMAGEN, withoutEnlargement: true })
      .webp({ quality: CALIDAD_IMAGEN })
      .toBuffer();
    return { buffer: salida, ext: '.webp' };
  } catch {
    return { buffer, ext: extDeMime(mimetype) };
  }
};

const escribir = async (publicId, buffer) => {
  const destino = rutaSegura(publicId);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, buffer);
};

// Imagen pública optimizada. Devuelve { url, publicId }.
export const subirImagenCloudinary = async (fileBuffer, mimetype, folder = 'general') => {
  try {
    const { buffer, ext } = await optimizarImagen(Buffer.from(fileBuffer), mimetype);
    const publicId = path.posix.join(
      CARPETA_PUBLICA,
      folder,
      nombreUnico('imagen', ext || '.bin'),
    );
    await escribir(publicId, buffer);
    return { url: `${PUBLIC_PREFIX}/${publicId}`, publicId };
  } catch (error) {
    console.error('Error al guardar imagen:', error.message);
    throw new Error('Error al subir la imagen');
  }
};

// Archivo genérico. Con { privado: true } queda bajo /uploads/priv/... y solo se
// sirve con sesión válida. Devuelve { url, publicId, format, resourceType, tipo }.
export const subirArchivoCloudinary = async (
  fileBuffer,
  mimetype,
  folder = 'archivos',
  originalName = 'archivo',
  { privado = false } = {},
) => {
  try {
    let buffer = Buffer.from(fileBuffer);
    let ext = path.extname(originalName) || extDeMime(mimetype);

    if (mimetype.startsWith('image/')) {
      const opt = await optimizarImagen(buffer, mimetype);
      buffer = opt.buffer;
      if (opt.ext) ext = opt.ext;
    }

    const raiz = privado ? CARPETA_PRIVADA : CARPETA_PUBLICA;
    const publicId = path.posix.join(raiz, folder, nombreUnico(originalName, ext));
    await escribir(publicId, buffer);

    return {
      url: `${PUBLIC_PREFIX}/${publicId}`,
      publicId,
      format: ext.replace('.', '') || String(originalName).split('.').pop(),
      resourceType: resourceTypeDeMime(mimetype),
      tipo: privado ? 'authenticated' : 'upload',
    };
  } catch (error) {
    console.error('Error al guardar archivo:', error.message);
    throw new Error(`Error al subir el archivo: ${error.message}`);
  }
};

// Antes: URL firmada temporal de Cloudinary. Ahora los privados se sirven por
// /uploads/priv/... detrás del guard de sesión, así que basta la ruta directa.
export const firmarUrlArchivo = (publicId) => {
  if (!publicId) return null;
  return `${PUBLIC_PREFIX}/${publicId}`;
};

export const eliminarArchivoCloudinary = async (publicId) => {
  try {
    if (!publicId) return;
    await fs.unlink(rutaSegura(publicId));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error al eliminar archivo local:', error.message);
    }
  }
};
