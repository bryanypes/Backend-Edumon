/**
 * resetBootstrapPasswords.js — recupera el acceso a las cuentas BOOTSTRAP_ADMIN_*
 * cuando se pierde/olvida su contraseña, sin tocar nada más.
 *
 * A diferencia de seed.js (que borra TODA la base de datos) o bootstrapAdmins.js
 * (que solo CREA cuentas si no existen y nunca las toca después), este script:
 *   - Busca por teléfono cada BOOTSTRAP_ADMIN_N configurado en el .env.
 *   - Si la cuenta ya existe, le pone de vuelta la contraseña que dice el .env
 *     (BOOTSTRAP_ADMIN_N_PASSWORD) y fuerza a cambiarla en el próximo login.
 *   - No crea cuentas nuevas, no toca cursos/tareas/entregas/otros usuarios,
 *     no borra nada.
 *
 * NO se llama desde server.js ni desde ningún flujo automático -- se corre a
 * mano, solo cuando hace falta. Un redeploy normal (backend o frontend) nunca
 * ejecuta esto.
 *
 * Uso:
 *   node src/scripts/resetBootstrapPasswords.js --confirmar
 */
import User from '../models/User.js';
import { leerAdminsDesdeEnv } from './bootstrapAdmins.js';

// función pura (sin conectar/desconectar Mongo ni process.exit) para poder
// probarla con la BD en memoria de los tests, igual que bootstrapAdmins()
export async function resetearContraseñasBootstrap() {
  const admins = leerAdminsDesdeEnv();
  const resultado = { actualizados: 0, noEncontrados: 0, omitidos: 0 };

  for (const { indice, ...datos } of admins) {
    if (!datos.telefono || !datos.contraseña) {
      console.error(`⚠️  BOOTSTRAP_ADMIN_${indice}_* incompleto (falta teléfono o contraseña); se omite.`);
      resultado.omitidos++;
      continue;
    }

    const usuario = await User.findOne({ telefono: datos.telefono });
    if (!usuario) {
      console.log(`⚠️  BOOTSTRAP_ADMIN_${indice}: no existe ningún usuario con el teléfono ${datos.telefono} todavía (reinicia el contenedor para que bootstrapAdmins.js lo cree).`);
      resultado.noEncontrados++;
      continue;
    }

    usuario.contraseña = datos.contraseña; // el pre('save') del modelo la vuelve a hashear
    usuario.primerInicioSesion = true;     // obliga a cambiarla en el próximo login
    await usuario.save();

    console.log(`✅ ${usuario.nombre} ${usuario.apellido} (${usuario.telefono}, rol ${usuario.rol}): contraseña restablecida a la del .env`);
    resultado.actualizados++;
  }

  return resultado;
}

// --- CLI: solo corre si se ejecuta directo ("node resetBootstrapPasswords.js"),
// no cuando otro módulo (como los tests) hace `import` de este archivo.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dotenv = await import('dotenv');
  dotenv.config();

  if (!process.argv.includes('--confirmar')) {
    console.error(
      '❌ Este script cambia contraseñas reales. Vuelve a correrlo agregando --confirmar:\n' +
      '   node src/scripts/resetBootstrapPasswords.js --confirmar',
    );
    process.exit(1);
  }

  const admins = leerAdminsDesdeEnv();
  if (admins.length === 0) {
    console.error('❌ No hay ningún BOOTSTRAP_ADMIN_* configurado en el .env');
    process.exit(1);
  }

  const mongoose = (await import('mongoose')).default;
  const connectDB = (await import('../config/database.js')).default;

  await connectDB();
  const { actualizados, noEncontrados } = await resetearContraseñasBootstrap();
  console.log(`\n${actualizados} cuenta(s) actualizada(s), ${noEncontrados} no encontrada(s).`);
  await mongoose.connection.close();
  process.exit(0);
}
