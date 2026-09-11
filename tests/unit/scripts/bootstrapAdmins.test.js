import { describe, it, expect, afterEach } from 'vitest';
import { bootstrapAdmins } from '../../../src/scripts/bootstrapAdmins.js';
import User from '../../../src/models/User.js';
import Institucion from '../../../src/models/Institucion.js';

const ENV_KEYS = [
  'BOOTSTRAP_ADMIN_1_NOMBRE', 'BOOTSTRAP_ADMIN_1_APELLIDO', 'BOOTSTRAP_ADMIN_1_CEDULA',
  'BOOTSTRAP_ADMIN_1_CORREO', 'BOOTSTRAP_ADMIN_1_TELEFONO', 'BOOTSTRAP_ADMIN_1_PASSWORD',
  'BOOTSTRAP_ADMIN_1_ROL',
  'BOOTSTRAP_ADMIN_2_NOMBRE', 'BOOTSTRAP_ADMIN_2_APELLIDO', 'BOOTSTRAP_ADMIN_2_CEDULA',
  'BOOTSTRAP_ADMIN_2_TELEFONO', 'BOOTSTRAP_ADMIN_2_PASSWORD',
  'BOOTSTRAP_INSTITUCION_NOMBRE', 'BOOTSTRAP_INSTITUCION_NIT',
  'BOOTSTRAP_INSTITUCION_DIRECCION', 'BOOTSTRAP_INSTITUCION_TELEFONO', 'BOOTSTRAP_INSTITUCION_CORREO',
];

const limpiarEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);

describe('bootstrapAdmins', () => {
  afterEach(limpiarEnv);

  it('no hace nada si no hay ninguna variable BOOTSTRAP_ADMIN_* configurada', async () => {
    await expect(bootstrapAdmins()).resolves.toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
  });

  it('crea el usuario con los datos del .env, normaliza el teléfono y por defecto rol superadmin', async () => {
    process.env.BOOTSTRAP_ADMIN_1_NOMBRE = 'Bryan David';
    process.env.BOOTSTRAP_ADMIN_1_APELLIDO = 'Yepes Ordóñez';
    process.env.BOOTSTRAP_ADMIN_1_CEDULA = '1000999888';
    process.env.BOOTSTRAP_ADMIN_1_CORREO = 'bryan@example.com';
    process.env.BOOTSTRAP_ADMIN_1_TELEFONO = '3165184192';
    process.env.BOOTSTRAP_ADMIN_1_PASSWORD = 'ClaveTemporal123';

    await bootstrapAdmins();

    const user = await User.findOne({ cedula: '1000999888' });
    expect(user).not.toBeNull();
    expect(user.telefono).toBe('+573165184192');
    expect(user.rol).toBe('superadmin');
    expect(user.primerInicioSesion).toBe(true);
    expect(user.estado).toBe('activo');
    expect(await user.comparePassword('ClaveTemporal123')).toBe(true);
  });

  it('es idempotente: correr dos veces no duplica ni pisa la contraseña ya cambiada', async () => {
    process.env.BOOTSTRAP_ADMIN_1_NOMBRE = 'Verónica';
    process.env.BOOTSTRAP_ADMIN_1_APELLIDO = 'Mancilla Solarte';
    process.env.BOOTSTRAP_ADMIN_1_CEDULA = '1000999777';
    process.env.BOOTSTRAP_ADMIN_1_TELEFONO = '3212660683';
    process.env.BOOTSTRAP_ADMIN_1_PASSWORD = 'ClaveTemporal123';

    await bootstrapAdmins();
    const user = await User.findOne({ cedula: '1000999777' });
    user.contraseña = 'OtraClaveQuePusoElUsuario1';
    user.primerInicioSesion = false;
    await user.save();

    await bootstrapAdmins(); // segunda corrida, mismas variables de entorno

    expect(await User.countDocuments({ cedula: '1000999777' })).toBe(1);
    const sigueIgual = await User.findOne({ cedula: '1000999777' });
    expect(sigueIgual.primerInicioSesion).toBe(false);
    expect(await sigueIgual.comparePassword('OtraClaveQuePusoElUsuario1')).toBe(true);
  });

  it('omite (sin lanzar) un admin con datos incompletos y sigue con los demás', async () => {
    process.env.BOOTSTRAP_ADMIN_1_NOMBRE = 'Incompleto';
    process.env.BOOTSTRAP_ADMIN_1_APELLIDO = 'Sin Cedula';
    process.env.BOOTSTRAP_ADMIN_1_TELEFONO = '3001112233';
    process.env.BOOTSTRAP_ADMIN_1_PASSWORD = 'ClaveTemporal123';
    // sin BOOTSTRAP_ADMIN_1_CEDULA

    process.env.BOOTSTRAP_ADMIN_2_NOMBRE = 'Completo';
    process.env.BOOTSTRAP_ADMIN_2_APELLIDO = 'Con Todo';
    process.env.BOOTSTRAP_ADMIN_2_CEDULA = '1000999666';
    process.env.BOOTSTRAP_ADMIN_2_TELEFONO = '3004445566';
    process.env.BOOTSTRAP_ADMIN_2_PASSWORD = 'ClaveTemporal123';

    await expect(bootstrapAdmins()).resolves.toBeUndefined();

    expect(await User.countDocuments()).toBe(1);
    expect(await User.findOne({ cedula: '1000999666' })).not.toBeNull();
  });

  it('no lanza si la validación del modelo falla (ej. cédula con formato inválido)', async () => {
    process.env.BOOTSTRAP_ADMIN_1_NOMBRE = 'Cedula Invalida';
    process.env.BOOTSTRAP_ADMIN_1_APELLIDO = 'Prueba';
    process.env.BOOTSTRAP_ADMIN_1_CEDULA = 'abc'; // no cumple /^\d{6,10}$/
    process.env.BOOTSTRAP_ADMIN_1_TELEFONO = '3009998877';
    process.env.BOOTSTRAP_ADMIN_1_PASSWORD = 'ClaveTemporal123';

    await expect(bootstrapAdmins()).resolves.toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('bootstrapAdmins — institución', () => {
  afterEach(limpiarEnv);

  it('no crea institución si no hay BOOTSTRAP_INSTITUCION_NOMBRE', async () => {
    process.env.BOOTSTRAP_ADMIN_1_NOMBRE = 'Sin';
    process.env.BOOTSTRAP_ADMIN_1_APELLIDO = 'Institucion';
    process.env.BOOTSTRAP_ADMIN_1_CEDULA = '1000999555';
    process.env.BOOTSTRAP_ADMIN_1_TELEFONO = '3001112244';
    process.env.BOOTSTRAP_ADMIN_1_PASSWORD = 'ClaveTemporal123';
    process.env.BOOTSTRAP_ADMIN_1_ROL = 'administrador';

    await bootstrapAdmins();

    expect(await Institucion.countDocuments()).toBe(0);
    const user = await User.findOne({ cedula: '1000999555' });
    expect(user.institucionId).toBeNull();
  });

  it('crea la institución y asigna institucionId a los admins con rol "administrador" (no a los superadmin)', async () => {
    process.env.BOOTSTRAP_INSTITUCION_NOMBRE = 'Institución Educativa de Prueba';
    process.env.BOOTSTRAP_INSTITUCION_NIT = '900123456-1';
    process.env.BOOTSTRAP_INSTITUCION_DIRECCION = 'Calle Falsa 123';

    process.env.BOOTSTRAP_ADMIN_1_NOMBRE = 'Admin';
    process.env.BOOTSTRAP_ADMIN_1_APELLIDO = 'Uno';
    process.env.BOOTSTRAP_ADMIN_1_CEDULA = '1000999444';
    process.env.BOOTSTRAP_ADMIN_1_TELEFONO = '3001112255';
    process.env.BOOTSTRAP_ADMIN_1_PASSWORD = 'ClaveTemporal123';
    process.env.BOOTSTRAP_ADMIN_1_ROL = 'administrador';

    process.env.BOOTSTRAP_ADMIN_2_NOMBRE = 'Super';
    process.env.BOOTSTRAP_ADMIN_2_APELLIDO = 'Dos';
    process.env.BOOTSTRAP_ADMIN_2_CEDULA = '1000999333';
    process.env.BOOTSTRAP_ADMIN_2_TELEFONO = '3001112266';
    process.env.BOOTSTRAP_ADMIN_2_PASSWORD = 'ClaveTemporal123';
    process.env.BOOTSTRAP_ADMIN_2_ROL = 'superadmin';

    await bootstrapAdmins();

    const institucion = await Institucion.findOne({ nit: '900123456-1' });
    expect(institucion).not.toBeNull();
    expect(institucion.codigo).toBeTruthy();

    const admin = await User.findOne({ cedula: '1000999444' });
    expect(admin.institucionId.toString()).toBe(institucion._id.toString());
    expect(institucion.adminId.toString()).toBe(admin._id.toString());

    const superadmin = await User.findOne({ cedula: '1000999333' });
    expect(superadmin.institucionId).toBeNull();
  });

  it('es idempotente: correr dos veces no duplica la institución ni pisa sus datos', async () => {
    process.env.BOOTSTRAP_INSTITUCION_NOMBRE = 'Institución Educativa de Prueba';
    process.env.BOOTSTRAP_INSTITUCION_NIT = '900123456-2';

    await bootstrapAdmins();
    const institucion = await Institucion.findOne({ nit: '900123456-2' });
    institucion.direccion = 'Dirección actualizada a mano';
    await institucion.save();

    await bootstrapAdmins();

    expect(await Institucion.countDocuments({ nit: '900123456-2' })).toBe(1);
    const sigueIgual = await Institucion.findOne({ nit: '900123456-2' });
    expect(sigueIgual.direccion).toBe('Dirección actualizada a mano');
  });

  it('no crea la institución (y avisa) si falta el NIT', async () => {
    process.env.BOOTSTRAP_INSTITUCION_NOMBRE = 'Institución Sin NIT';

    await expect(bootstrapAdmins()).resolves.toBeUndefined();
    expect(await Institucion.countDocuments()).toBe(0);
  });
});
