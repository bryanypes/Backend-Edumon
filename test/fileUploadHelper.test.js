import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getFileBuffer } from '../src/utils/fileUploadHelper.js';

test('getFileBuffer devuelve el buffer desde un archivo con buffer', async () => {
  const file = { buffer: Buffer.from('hola') };
  const buffer = await getFileBuffer(file);
  assert.equal(buffer.toString(), 'hola');
});

test('getFileBuffer lee el archivo desde la ruta cuando no hay buffer', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edumon-test-'));
  const filePath = path.join(dir, 'archivo.txt');
  await fs.writeFile(filePath, 'desde-disco');

  const file = { path: filePath };
  const buffer = await getFileBuffer(file);

  assert.equal(buffer.toString(), 'desde-disco');

  await fs.rm(dir, { recursive: true, force: true });
});

test('getFileBuffer acepta buffers tipo Uint8Array', async () => {
  const file = { buffer: new Uint8Array(Buffer.from('uint8')) };
  const buffer = await getFileBuffer(file);

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.toString(), 'uint8');
});
