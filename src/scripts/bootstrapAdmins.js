/**
 * bootstrapAdmins.js — crea la institución y los superadmins/administradores
 * iniciales del piloto.
 *
 * Corre automáticamente cada vez que el backend arranca (ver server.js, justo
 * después de conectar a MongoDB) — así, cuando se levanta el contenedor por
 * primera vez contra una base de datos vacía, queda listo sin pasos manuales.
 *
 * Es IDEMPOTENTE y nunca borra ni modifica nada: si el usuario ya existe
 * (por cédula o teléfono) o la institución ya existe (por NIT) se omite tal
 * cual está. Un reinicio del contenedor jamás pisa una cuenta ya creada, su
 * contraseña, ni los datos de la institución — a diferencia de seed.js, que
 * resetea toda la base de datos y es solo para entornos de prueba.
 *
 * Los datos NO se versionan en el código (son información real de personas
 * y de la institución): se leen de variables de entorno — ver .env.example.
 * Si no hay ninguna configurada, esta función no hace nada.
 */
import Institucion from '../models/Institucion.js';
import User from '../models/User.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';

function leerAdminsDesdeEnv() {
  const admins = [];
  for (let i = 1; process.env[`BOOTSTRAP_ADMIN_${i}_TELEFONO`] !== undefined; i++) {
    const valor = (sufijo) => process.env[`BOOTSTRAP_ADMIN_${i}_${sufijo}`]?.trim() || undefined;
    admins.push({
      indice: i,
      nombre: valor('NOMBRE'),
      apellido: valor('APELLIDO'),
      cedula: valor('CEDULA'),
      correo: valor('CORREO'),
      telefono: normalizarTelefono(valor('TELEFONO')),
      contraseña: valor('PASSWORD'),
      rol: valor('ROL') || 'superadmin',
    });
  }
  return admins;
}

// Solo se activa si BOOTSTRAP_INSTITUCION_NOMBRE está configurado. Los
// administradores del bootstrap (rol "administrador") quedan asignados a
// esta institución; los superadmin no la necesitan.
async function bootstrapInstitucion() {
  const nombre = process.env.BOOTSTRAP_INSTITUCION_NOMBRE?.trim();
  if (!nombre) return null;

  const nit = process.env.BOOTSTRAP_INSTITUCION_NIT?.trim();
  if (!nit) {
    console.error('[bootstrap] BOOTSTRAP_INSTITUCION_NOMBRE está configurado pero falta BOOTSTRAP_INSTITUCION_NIT; se omite la institución.');
    return null;
  }

  const existente = await Institucion.findOne({ nit });
  if (existente) {
    console.log(`[bootstrap] La institución ya existe (NIT ${nit}), se omite.`);
    return existente;
  }

  try {
    const institucion = await Institucion.create({
      nombre,
      nit,
      direccion: process.env.BOOTSTRAP_INSTITUCION_DIRECCION?.trim() || undefined,
      telefono: normalizarTelefono(process.env.BOOTSTRAP_INSTITUCION_TELEFONO)
        || process.env.BOOTSTRAP_INSTITUCION_TELEFONO?.trim() || undefined,
      correo: process.env.BOOTSTRAP_INSTITUCION_CORREO?.trim() || undefined,
    });
    console.log(`[bootstrap] Institución creada: "${institucion.nombre}" (código ${institucion.codigo})`);
    return institucion;
  } catch (error) {
    console.error('[bootstrap] No se pudo crear la institución:', error.message);
    return null;
  }
}

export async function bootstrapAdmins() {
  const institucion = await bootstrapInstitucion();
  const admins = leerAdminsDesdeEnv();
  if (admins.length === 0) return;

  for (const { indice, ...datos } of admins) {
    const faltantes = ['nombre', 'apellido', 'cedula', 'telefono', 'contraseña']
      .filter((campo) => !datos[campo]);

    if (faltantes.length > 0) {
      console.error(
        `[bootstrap] BOOTSTRAP_ADMIN_${indice}_* incompleto (faltan: ${faltantes.join(', ')}); se omite.`,
      );
      continue;
    }

    try {
      const yaExiste = await User.findOne({
        $or: [{ telefono: datos.telefono }, { cedula: datos.cedula }],
      });
      if (yaExiste) {
        console.log(`[bootstrap] Ya existe (${datos.telefono} / cédula ${datos.cedula}), se omite.`);
        continue;
      }

      // rol "administrador" queda atado a la institución del bootstrap (si hay);
      // "superadmin" no la necesita, no está limitado a una sola institución
      const institucionId = datos.rol === 'administrador' && institucion ? institucion._id : null;

      const nuevoUsuario = await User.create({
        ...datos,
        institucionId,
        estado: 'activo',
        primerInicioSesion: true, // fuerza a cambiar la contraseña temporal en el primer login
      });

      if (institucionId && !institucion.adminId) {
        institucion.adminId = nuevoUsuario._id;
        await institucion.save();
      }

      console.log(`[bootstrap] Usuario "${datos.rol}" creado: ${datos.nombre} ${datos.apellido} (${datos.telefono})`);
    } catch (error) {
      console.error(`[bootstrap] No se pudo crear a "${datos.nombre} ${datos.apellido}":`, error.message);
    }
  }
}

export default bootstrapAdmins;
