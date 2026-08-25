import { describe, it, expect, vi } from 'vitest';
import {
  uploadImagenCloudinary,
  uploadImagenYCSV,
  uploadCSVCloudinary,
  uploadArchivoCloudinary,
} from '../../../src/middlewares/cloudinaryMiddleware.js';

const filtrar = (multerInstance, mimetype, originalname = 'archivo') =>
  new Promise((resolve) => {
    const cb = vi.fn();
    multerInstance.fileFilter({}, { mimetype, originalname }, (err, aceptado) => {
      cb(err, aceptado);
      resolve({ err, aceptado });
    });
  });

describe('uploadImagenCloudinary (fotos de perfil / portadas)', () => {
  it('acepta JPEG, PNG, GIF y WEBP', async () => {
    for (const mimetype of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      const { err, aceptado } = await filtrar(uploadImagenCloudinary, mimetype);
      expect(err).toBeNull();
      expect(aceptado).toBe(true);
    }
  });

  it('rechaza un PDF con un error explicativo', async () => {
    const { err, aceptado } = await filtrar(uploadImagenCloudinary, 'application/pdf');
    expect(err).toBeInstanceOf(Error);
    expect(aceptado).toBeFalsy();
  });

  it('el límite de tamaño está fijado en 5MB', () => {
    expect(uploadImagenCloudinary.limits.fileSize).toBe(5 * 1024 * 1024);
  });
});

describe('uploadImagenYCSV (creación de curso)', () => {
  it('acepta imágenes', async () => {
    const { aceptado } = await filtrar(uploadImagenYCSV, 'image/png');
    expect(aceptado).toBe(true);
  });

  it('acepta Excel por mimetype de .xlsx', async () => {
    const { aceptado } = await filtrar(
      uploadImagenYCSV,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'participantes.xlsx'
    );
    expect(aceptado).toBe(true);
  });

  it('acepta Excel por extensión .xlsm aunque el mimetype sea genérico', async () => {
    const { aceptado } = await filtrar(uploadImagenYCSV, 'application/octet-stream', 'participantes.xlsm');
    expect(aceptado).toBe(true);
  });

  it('rechaza un ejecutable', async () => {
    const { err } = await filtrar(uploadImagenYCSV, 'application/x-msdownload', 'virus.exe');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('uploadCSVCloudinary (carga masiva)', () => {
  it('acepta .xlsm por extensión aunque el mimetype sea genérico', async () => {
    const { aceptado } = await filtrar(uploadCSVCloudinary, 'application/octet-stream', 'participantes.xlsm');
    expect(aceptado).toBe(true);
  });

  it('rechaza cualquier cosa que no sea Excel', async () => {
    const { err } = await filtrar(uploadCSVCloudinary, 'image/png', 'foto.png');
    expect(err).toBeInstanceOf(Error);
  });

  it('el límite de tamaño está fijado en 5MB', () => {
    expect(uploadCSVCloudinary.limits.fileSize).toBe(5 * 1024 * 1024);
  });
});

describe('uploadArchivoCloudinary (adjuntos generales)', () => {
  it('acepta PDF, Word, Excel, imágenes y video', async () => {
    const tipos = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'image/jpeg',
      'video/mp4',
    ];
    for (const mimetype of tipos) {
      const { aceptado } = await filtrar(uploadArchivoCloudinary, mimetype);
      expect(aceptado).toBe(true);
    }
  });

  it('rechaza un tipo no soportado', async () => {
    const { err } = await filtrar(uploadArchivoCloudinary, 'application/x-rar-compressed');
    expect(err).toBeInstanceOf(Error);
  });
});
