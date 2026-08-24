import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFileBuffer } from '../../../src/utils/fileUploadHelper.js';

describe('getFileBuffer', () => {
  const archivosTemporales = [];

  afterEach(async () => {
    await Promise.all(archivosTemporales.splice(0).map((p) => fs.rm(p, { force: true })));
  });

  it('devuelve null si no se pasa archivo', async () => {
    expect(await getFileBuffer(null)).toBeNull();
    expect(await getFileBuffer(undefined)).toBeNull();
  });

  it('devuelve un Buffer a partir de file.buffer (multer memoryStorage)', async () => {
    const original = Buffer.from('contenido de prueba');
    const resultado = await getFileBuffer({ buffer: original });
    expect(Buffer.isBuffer(resultado)).toBe(true);
    expect(resultado.equals(original)).toBe(true);
  });

  it('acepta un Uint8Array como file.buffer', async () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    const resultado = await getFileBuffer({ buffer: original });
    expect(Buffer.isBuffer(resultado)).toBe(true);
    expect([...resultado]).toEqual([1, 2, 3, 4]);
  });

  it('lee desde file.path si no hay buffer (multer diskStorage)', async () => {
    const rutaTemp = path.join(os.tmpdir(), `edumon-test-${Date.now()}.txt`);
    archivosTemporales.push(rutaTemp);
    await fs.writeFile(rutaTemp, 'contenido en disco');

    const resultado = await getFileBuffer({ path: rutaTemp });
    expect(resultado.toString()).toBe('contenido en disco');
  });

  it('lee directamente si se le pasa un string como ruta', async () => {
    const rutaTemp = path.join(os.tmpdir(), `edumon-test-string-${Date.now()}.txt`);
    archivosTemporales.push(rutaTemp);
    await fs.writeFile(rutaTemp, 'ruta directa');

    const resultado = await getFileBuffer(rutaTemp);
    expect(resultado.toString()).toBe('ruta directa');
  });

  it('devuelve null si el objeto no tiene buffer ni path', async () => {
    expect(await getFileBuffer({})).toBeNull();
  });
});
