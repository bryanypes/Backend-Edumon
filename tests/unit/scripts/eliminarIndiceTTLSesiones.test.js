import { describe, it, expect, vi } from 'vitest';
import User from '../../../src/models/User.js';
import { eliminarIndiceTTLSesiones, INDICE_TTL_SESIONES } from '../../../src/scripts/eliminarIndiceTTLSesiones.js';

const nombresDeIndices = async () => (await User.collection.indexes()).map((i) => i.name);

describe('eliminarIndiceTTLSesiones', () => {
  it('el esquema de User no declara índices con expireAfterSeconds', () => {
    const conTTL = User.schema.indexes().filter(([, opciones]) => opciones?.expireAfterSeconds !== undefined);
    expect(conTTL).toEqual([]);
  });

  it('elimina el índice viejo si existe y devuelve true', async () => {
    await User.createCollection();
    await User.collection.createIndex({ 'refreshTokens.expiraEn': 1 }, { expireAfterSeconds: 0 });
    expect(await nombresDeIndices()).toContain(INDICE_TTL_SESIONES);

    await expect(eliminarIndiceTTLSesiones()).resolves.toBe(true);
    expect(await nombresDeIndices()).not.toContain(INDICE_TTL_SESIONES);
  });

  it('devuelve false si el índice no existe', async () => {
    await User.createCollection();
    await expect(eliminarIndiceTTLSesiones()).resolves.toBe(false);
  });

  it('propaga cualquier otro error de dropIndex', async () => {
    const error = Object.assign(new Error('not authorized'), { code: 13, codeName: 'Unauthorized' });
    const coleccion = { dropIndex: vi.fn().mockRejectedValue(error) };
    await expect(eliminarIndiceTTLSesiones(coleccion)).rejects.toBe(error);
  });

  it('un usuario con una sesión vencida sigue existiendo después de syncIndexes', async () => {
    const usuario = await User.create({
      nombre: 'Ana',
      apellido: 'Ficticia',
      cedula: '1000555301',
      telefono: '+573005550301',
      contraseña: 'Clave123*',
      rol: 'padre',
      refreshTokens: [{ tokenHash: 'hash-ficticio', expiraEn: new Date(Date.now() - 60_000) }],
    });

    await User.syncIndexes();

    const indices = await User.collection.indexes();
    expect(indices.some((i) => i.expireAfterSeconds !== undefined)).toBe(false);
    expect(await User.findById(usuario._id)).not.toBeNull();
  });
});
