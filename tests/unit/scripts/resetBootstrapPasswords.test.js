import { describe, it, expect, afterEach } from 'vitest';
import { resetearContraseñasBootstrap } from '../../../src/scripts/resetBootstrapPasswords.js';
import { bootstrapAdmins } from '../../../src/scripts/bootstrapAdmins.js';
import User from '../../../src/models/User.js';
import { crearPadre, crearCurso, crearTarea } from '../../helpers/factories.js';

const ENV_KEYS = [
  'BOOTSTRAP_ADMIN_1_NOMBRE', 'BOOTSTRAP_ADMIN_1_APELLIDO', 'BOOTSTRAP_ADMIN_1_CEDULA',
  'BOOTSTRAP_ADMIN_1_CORREO', 'BOOTSTRAP_ADMIN_1_TELEFONO', 'BOOTSTRAP_ADMIN_1_PASSWORD',
  'BOOTSTRAP_ADMIN_1_ROL',
];

const limpiarEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);

const configurarAdmin1 = (telefono = '3165184192') => {
  process.env.BOOTSTRAP_ADMIN_1_NOMBRE = 'Bryan David';
  process.env.BOOTSTRAP_ADMIN_1_APELLIDO = 'Yepes Ordóñez';
  process.env.BOOTSTRAP_ADMIN_1_CEDULA = '1000999888';
  process.env.BOOTSTRAP_ADMIN_1_TELEFONO = telefono;
  process.env.BOOTSTRAP_ADMIN_1_PASSWORD = 'ClaveDelEnv123';
};

describe('resetearContraseñasBootstrap', () => {
  afterEach(limpiarEnv);

  it('le pone de vuelta al usuario la contraseña que dice el .env, aunque la haya cambiado', async () => {
    configurarAdmin1();
    await bootstrapAdmins();

    const usuario = await User.findOne({ cedula: '1000999888' });
    usuario.contraseña = 'ElUsuarioLaCambioYSeLeOlvido1';
    usuario.primerInicioSesion = false;
    await usuario.save();

    const resultado = await resetearContraseñasBootstrap();

    expect(resultado).toEqual({ actualizados: 1, noEncontrados: 0, omitidos: 0 });
    const actualizado = await User.findOne({ cedula: '1000999888' });
    expect(await actualizado.comparePassword('ClaveDelEnv123')).toBe(true);
    expect(actualizado.primerInicioSesion).toBe(true);
  });

  it('no crea la cuenta si todavía no existe, solo avisa', async () => {
    configurarAdmin1();

    const resultado = await resetearContraseñasBootstrap();

    expect(resultado).toEqual({ actualizados: 0, noEncontrados: 1, omitidos: 0 });
    expect(await User.countDocuments()).toBe(0);
  });

  it('no hace nada si no hay ningún BOOTSTRAP_ADMIN_* configurado', async () => {
    const resultado = await resetearContraseñasBootstrap();
    expect(resultado).toEqual({ actualizados: 0, noEncontrados: 0, omitidos: 0 });
  });

  it('CRÍTICO: no toca ningún otro dato (otros usuarios, cursos, tareas)', async () => {
    configurarAdmin1();
    await bootstrapAdmins();

    const padre = await crearPadre();
    const curso = await crearCurso();
    const tarea = await crearTarea({ cursoId: curso._id, docenteId: curso.docenteId });

    await resetearContraseñasBootstrap();

    expect(await User.findById(padre._id)).not.toBeNull();
    expect((await User.findById(padre._id)).nombre).toBe(padre.nombre);
    expect(await curso.constructor.findById(curso._id)).not.toBeNull();
    expect(await tarea.constructor.findById(tarea._id)).not.toBeNull();
  });
});
