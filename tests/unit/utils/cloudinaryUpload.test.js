import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  subirImagenCloudinary,
  subirArchivoCloudinary,
  firmarUrlArchivo,
  eliminarArchivoCloudinary,
  resourceTypeDeMime,
} from '../../../src/utils/cloudinaryUpload.js';
import { UPLOAD_DIR } from '../../../src/config/almacenamiento.js';

// pixel PNG 1x1 válido para que sharp no falle
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('almacenamiento local (cloudinaryUpload)', () => {
  it('subirImagenCloudinary escribe el archivo bajo UPLOAD_DIR/pub y devuelve url + publicId', async () => {
    const { url, publicId } = await subirImagenCloudinary(PNG_1PX, 'image/png', 'fotos-perfil');

    expect(publicId).toMatch(/^pub\/fotos-perfil\//);
    expect(url).toBe(`/uploads/${publicId}`);

    const contenido = await fs.readFile(path.join(UPLOAD_DIR, publicId));
    expect(contenido.length).toBeGreaterThan(0);
  });

  it('subirArchivoCloudinary con { privado: true } guarda bajo pub/priv y marca el tipo', async () => {
    const { url, publicId, tipo, resourceType } = await subirArchivoCloudinary(
      Buffer.from('%PDF-1.4 test'),
      'application/pdf',
      'archivos-entregas',
      'Informe Final (v2).pdf',
      { privado: true },
    );

    expect(publicId).toMatch(/^priv\/archivos-entregas\/\d+_[a-f0-9]+_Informe_Final__v2_\.pdf$/);
    expect(url).toBe(`/uploads/${publicId}`);
    expect(tipo).toBe('authenticated');
    expect(resourceType).toBe('raw');
    await expect(fs.readFile(path.join(UPLOAD_DIR, publicId))).resolves.toBeDefined();
  });

  it('resourceTypeDeMime clasifica image / video / raw', () => {
    expect(resourceTypeDeMime('image/png')).toBe('image');
    expect(resourceTypeDeMime('video/mp4')).toBe('video');
    expect(resourceTypeDeMime('application/pdf')).toBe('raw');
  });

  it('firmarUrlArchivo devuelve la ruta pública directa y null sin publicId', () => {
    expect(firmarUrlArchivo('priv/archivos-entregas/x.pdf')).toBe('/uploads/priv/archivos-entregas/x.pdf');
    expect(firmarUrlArchivo(null)).toBeNull();
  });

  it('eliminarArchivoCloudinary borra el archivo y no lanza si no existe', async () => {
    const { publicId } = await subirArchivoCloudinary(Buffer.from('x'), 'application/pdf', 'foros', 'a.pdf');
    const ruta = path.join(UPLOAD_DIR, publicId);
    await expect(fs.access(ruta)).resolves.toBeUndefined();

    await eliminarArchivoCloudinary(publicId);
    await expect(fs.access(ruta)).rejects.toBeDefined();

    await expect(eliminarArchivoCloudinary(publicId)).resolves.toBeUndefined();
    await expect(eliminarArchivoCloudinary(null)).resolves.toBeUndefined();
  });

  it('eliminarArchivoCloudinary rechaza rutas que intentan escapar de UPLOAD_DIR', async () => {
    await expect(eliminarArchivoCloudinary('../../etc/passwd')).resolves.toBeUndefined();
  });
});
