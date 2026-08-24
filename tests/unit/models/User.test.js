import { describe, it, expect } from 'vitest';
import User from '../../../src/models/User.js';
import { crearUsuario, cedulaDePrueba } from '../../helpers/factories.js';
import { AVATAR_PREDETERMINADO } from '../../../src/utils/avatarPredeterminado.js';

describe('User — validaciones de schema', () => {
  it('requiere nombre, apellido, cedula, contraseña y rol', async () => {
    const user = new User({});
    const error = user.validateSync();
    expect(error.errors.nombre).toBeDefined();
    expect(error.errors.apellido).toBeDefined();
    expect(error.errors.cedula).toBeDefined();
    expect(error.errors.contraseña).toBeDefined();
    expect(error.errors.rol).toBeDefined();
  });

  it('rechaza una cédula con letras o con menos de 6 dígitos', async () => {
    const base = { nombre: 'A', apellido: 'B', contraseña: '123456', rol: 'padre' };
    expect(new User({ ...base, cedula: 'abc123' }).validateSync().errors.cedula).toBeDefined();
    expect(new User({ ...base, cedula: '123' }).validateSync().errors.cedula).toBeDefined();
    expect(new User({ ...base, cedula: '12345678901' }).validateSync().errors.cedula).toBeDefined();
  });

  it('acepta una cédula de entre 6 y 10 dígitos', () => {
    const base = { nombre: 'A', apellido: 'B', contraseña: '123456', rol: 'padre' };
    expect(new User({ ...base, cedula: '123456' }).validateSync()?.errors.cedula).toBeUndefined();
    expect(new User({ ...base, cedula: '1234567890' }).validateSync()?.errors.cedula).toBeUndefined();
  });

  it('rechaza un rol fuera del enum', () => {
    const user = new User({ nombre: 'A', apellido: 'B', cedula: '123456', contraseña: '123456', rol: 'estudiante' });
    expect(user.validateSync().errors.rol).toBeDefined();
  });

  it('rechaza una contraseña de menos de 6 caracteres', () => {
    const user = new User({ nombre: 'A', apellido: 'B', cedula: '123456', contraseña: '123', rol: 'padre' });
    expect(user.validateSync().errors.contraseña).toBeDefined();
  });

  it('rechaza un correo con formato inválido cuando se provee', () => {
    const user = new User({ nombre: 'A', apellido: 'B', cedula: '123456', contraseña: '123456', rol: 'padre', correo: 'no-es-un-correo' });
    expect(user.validateSync().errors.correo).toBeDefined();
  });

  it('el correo es opcional (sparse) — no falla si se omite', () => {
    const user = new User({ nombre: 'A', apellido: 'B', cedula: '123456', contraseña: '123456', rol: 'padre' });
    expect(user.validateSync()?.errors.correo).toBeUndefined();
  });

  it('estado por defecto es "activo" y rechaza valores fuera del enum', () => {
    const user = new User({ nombre: 'A', apellido: 'B', cedula: '123456', contraseña: '123456', rol: 'padre' });
    expect(user.estado).toBe('activo');
    user.estado = 'baneado';
    expect(user.validateSync().errors.estado).toBeDefined();
  });

  it('fotoPerfilUrl usa el avatar predeterminado por defecto', () => {
    const user = new User({ nombre: 'A', apellido: 'B', cedula: '123456', contraseña: '123456', rol: 'padre' });
    expect(user.fotoPerfilUrl).toBe(AVATAR_PREDETERMINADO);
  });
});

describe('User — índices únicos', () => {
  it('rechaza una cédula duplicada', async () => {
    const cedula = cedulaDePrueba();
    await crearUsuario('padre', { cedula });
    await expect(crearUsuario('docente', { cedula })).rejects.toThrow();
  });

  it('rechaza un correo duplicado entre dos usuarios', async () => {
    const correo = 'duplicado@test.edumon.com';
    await crearUsuario('padre', { correo });
    await expect(crearUsuario('docente', { correo })).rejects.toThrow();
  });

  it('permite que dos usuarios no tengan correo a la vez (índice sparse)', async () => {
    await crearUsuario('padre', { correo: undefined });
    await expect(crearUsuario('docente', { correo: undefined })).resolves.toBeTruthy();
  });
});

describe('User — hash de contraseña y comparePassword', () => {
  it('hashea la contraseña al guardar (no queda en texto plano)', async () => {
    const user = await crearUsuario('padre', { contraseña: 'MiClave123' });
    expect(user.contraseña).not.toBe('MiClave123');
    expect(user.contraseña.length).toBeGreaterThan(20);
  });

  it('comparePassword devuelve true para la contraseña correcta y false para la incorrecta', async () => {
    const user = await crearUsuario('padre', { contraseña: 'MiClave123' });
    expect(await user.comparePassword('MiClave123')).toBe(true);
    expect(await user.comparePassword('OtraClave')).toBe(false);
  });

  it('no re-hashea la contraseña si se guarda sin modificarla', async () => {
    const user = await crearUsuario('padre', { contraseña: 'MiClave123' });
    const hashOriginal = user.contraseña;
    user.nombre = 'Otro nombre';
    await user.save();
    expect(user.contraseña).toBe(hashOriginal);
  });
});

describe('User — toJSON', () => {
  it('nunca expone contraseña ni refreshTokens', async () => {
    const user = await crearUsuario('padre');
    const json = user.toJSON();
    expect(json.contraseña).toBeUndefined();
    expect(json.refreshTokens).toBeUndefined();
    expect(json.nombre).toBeDefined();
  });
});
