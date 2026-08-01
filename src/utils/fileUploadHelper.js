import fs from 'node:fs/promises';

const esBufferLike = (value) => {
  return Buffer.isBuffer(value) || value instanceof Uint8Array || ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
};

export const getFileBuffer = async (file) => {
  if (!file) return null;

  if (esBufferLike(file.buffer)) {
    return Buffer.from(file.buffer);
  }

  if (typeof file.path === 'string') {
    return fs.readFile(file.path);
  }

  if (typeof file === 'string') {
    return fs.readFile(file);
  }

  return null;
};
