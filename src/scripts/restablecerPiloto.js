/**
 * restablecerPiloto.js — deja la base del piloto como recién instalada.
 *
 *   npm run piloto:restablecer -- --confirmar
 *
 * 1. Vacía TODAS las colecciones de la base apuntada por MONGO_URI, excepto la
 *    de APK (las versiones publicadas de la app móvil se conservan). Se vacían en
 *    vez de borrarse para no perder los índices. Los archivos en disco no se tocan.
 * 2. Vuelve a crear la institución y los usuarios iniciales con bootstrapAdmins()
 *    (BOOTSTRAP_INSTITUCION_* y BOOTSTRAP_ADMIN_* del .env), igual que al arrancar.
 * 3. Crea el contenido inicial del piloto (PILOTO_* del .env), todo a nombre de la
 *    docente de PILOTO_DOCENTE_TELEFONO: curso, módulos, reto y foro con sus mensajes.
 *
 * Los datos son reales (personas e institución), por eso viven en el .env y no
 * en el código: ver la sección "Piloto" de .env.example.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

import Apk from '../models/Apk.js';
import User from '../models/User.js';
import Curso from '../models/Curso.js';
import Modulo from '../models/Modulo.js';
import Tarea from '../models/Tarea.js';
import Foro from '../models/Foro.js';
import MensajeForo from '../models/MensajeForo.js';
import { bootstrapAdmins } from './bootstrapAdmins.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';

const texto = (env, clave) => env[clave]?.trim() || undefined;

/** Lee y valida el contenido del piloto desde el entorno. Lanza un error con lo que falte. */
export function leerContenidoPiloto(env = process.env) {
  const t = (clave) => texto(env, clave);
  const modulos = [];
  for (let i = 1; t(`PILOTO_MODULO_${i}_TITULO`); i++) {
    modulos.push({ titulo: t(`PILOTO_MODULO_${i}_TITULO`), descripcion: t(`PILOTO_MODULO_${i}_DESCRIPCION`) });
  }
  const mensajes = [];
  for (let i = 1; t(`PILOTO_FORO_MENSAJE_${i}`); i++) mensajes.push(t(`PILOTO_FORO_MENSAJE_${i}`));

  const contenido = {
    docenteTelefono: normalizarTelefono(t('PILOTO_DOCENTE_TELEFONO')),
    curso: { nombre: t('PILOTO_CURSO_NOMBRE'), descripcion: t('PILOTO_CURSO_DESCRIPCION') },
    modulos,
    tarea: {
      titulo: t('PILOTO_TAREA_TITULO'),
      descripcion: t('PILOTO_TAREA_DESCRIPCION'),
      fechaEntrega: t('PILOTO_TAREA_FECHA_ENTREGA') && new Date(t('PILOTO_TAREA_FECHA_ENTREGA')),
      tipoEntrega: t('PILOTO_TAREA_TIPO_ENTREGA') || 'archivo',
      modulo: Number(t('PILOTO_TAREA_MODULO') || modulos.length),
    },
    foro: {
      titulo: t('PILOTO_FORO_TITULO'),
      descripcion: t('PILOTO_FORO_DESCRIPCION'),
      fecha: t('PILOTO_FORO_FECHA') && new Date(t('PILOTO_FORO_FECHA')),
      mensajes,
    },
  };

  const faltan = [
    !contenido.docenteTelefono && 'PILOTO_DOCENTE_TELEFONO',
    !contenido.curso.nombre && 'PILOTO_CURSO_NOMBRE',
    !contenido.curso.descripcion && 'PILOTO_CURSO_DESCRIPCION',
    modulos.length === 0 && 'PILOTO_MODULO_1_TITULO',
    !contenido.tarea.titulo && 'PILOTO_TAREA_TITULO',
    !(contenido.tarea.fechaEntrega instanceof Date) && 'PILOTO_TAREA_FECHA_ENTREGA',
    contenido.tarea.fechaEntrega instanceof Date && Number.isNaN(contenido.tarea.fechaEntrega.getTime()) && 'PILOTO_TAREA_FECHA_ENTREGA (fecha inválida)',
    !(contenido.tarea.modulo >= 1 && contenido.tarea.modulo <= modulos.length) && 'PILOTO_TAREA_MODULO (fuera de rango)',
    !contenido.foro.titulo && 'PILOTO_FORO_TITULO',
    !contenido.foro.descripcion && 'PILOTO_FORO_DESCRIPCION',
  ].filter(Boolean);
  if (faltan.length) throw new Error(`Faltan o son inválidas en el .env: ${faltan.join(', ')}`);
  return contenido;
}

/** Colecciones que se vacían: todas menos la de APK y las internas de Mongo. */
export async function coleccionesAVaciar(db = mongoose.connection.db) {
  const conservar = new Set([Apk.collection.collectionName]);
  const todas = await db.listCollections({}, { nameOnly: true }).toArray();
  return todas.map((c) => c.name).filter((n) => !conservar.has(n) && !n.startsWith('system.'));
}

/** Vacía la base (menos APK) y crea el contenido inicial. Requiere una conexión abierta. */
export async function restablecerPiloto(env = process.env) {
  const contenido = leerContenidoPiloto(env); // valida ANTES de borrar nada

  const db = mongoose.connection.db;
  const vaciadas = {};
  for (const nombre of await coleccionesAVaciar(db)) {
    const { deletedCount } = await db.collection(nombre).deleteMany({});
    vaciadas[nombre] = deletedCount;
  }

  await bootstrapAdmins();

  const docente = await User.findOne({ telefono: contenido.docenteTelefono, rol: 'docente' });
  if (!docente) {
    throw new Error(`No se creó la docente ${contenido.docenteTelefono}: revisa su bloque BOOTSTRAP_ADMIN_* (ROL=docente) en el .env.`);
  }
  if (!docente.institucionId) {
    throw new Error('La docente quedó sin institución: revisa BOOTSTRAP_INSTITUCION_NOMBRE y BOOTSTRAP_INSTITUCION_NIT en el .env.');
  }

  const curso = await Curso.create({
    ...contenido.curso,
    docenteId: docente._id,
    institucionId: docente.institucionId,
    estado: 'activo',
    participantes: [{ usuarioId: docente._id, etiqueta: 'docente' }],
  });

  // la app lista los módulos del más reciente al más antiguo: el 1 se fecha último
  // para que se vean en el orden del .env
  const modulos = [];
  const base = Date.now();
  for (const [i, m] of contenido.modulos.entries()) {
    const fechaCreacion = new Date(base + (contenido.modulos.length - 1 - i) * 1000);
    modulos.push(await Modulo.create({ cursoId: curso._id, ...m, estado: 'activo', fechaCreacion }));
  }

  const tarea = await Tarea.create({
    titulo: contenido.tarea.titulo,
    descripcion: contenido.tarea.descripcion,
    fechaEntrega: contenido.tarea.fechaEntrega,
    tipoEntrega: contenido.tarea.tipoEntrega,
    docenteId: docente._id,
    cursoId: curso._id,
    moduloId: modulos[contenido.tarea.modulo - 1]._id,
    estado: 'publicada',
    asignacionTipo: 'todos',
  });

  // la web muestra createdAt: se fija a mano (timestamps: false) para conservar la fecha original
  const conFecha = (fecha) => ({ fechaCreacion: fecha, createdAt: fecha, updatedAt: fecha });
  const fechaForo = contenido.foro.fecha ?? new Date();
  const foro = await new Foro({
    titulo: contenido.foro.titulo,
    descripcion: contenido.foro.descripcion,
    docenteId: docente._id,
    cursoId: curso._id,
    estado: 'abierto',
    ...conFecha(fechaForo),
  }).save({ timestamps: false });

  // el primer mensaje abre la conversación; los siguientes le responden
  let raiz = null;
  for (const [i, contenidoMensaje] of contenido.foro.mensajes.entries()) {
    const mensaje = await new MensajeForo({
      foroId: foro._id,
      usuarioId: docente._id,
      contenido: contenidoMensaje,
      respuestaA: raiz?._id ?? null,
      ...conFecha(new Date(fechaForo.getTime() + i * 60_000)),
    }).save({ timestamps: false });
    raiz ??= mensaje;
  }

  return {
    vaciadas,
    apksConservadas: await Apk.countDocuments(),
    docente: `${docente.nombre} ${docente.apellido} (${docente.telefono})`,
    curso: curso.nombre,
    modulos: modulos.map((m) => m.titulo),
    tarea: `${tarea.titulo} → ${modulos[contenido.tarea.modulo - 1].titulo}`,
    foro: `${foro.titulo} (${contenido.foro.mensajes.length} mensajes)`,
  };
}

// descripción de la base sin credenciales, para que se vea a dónde se va a borrar
const describirDestino = (uri = '') => uri.replace(/\/\/[^@/]*@/, '//***@').replace(/\?.*$/, '');

async function main() {
  dotenv.config(); // solo al ejecutar el comando: las pruebas no deben leer el .env real
  if (!process.argv.includes('--confirmar')) {
    console.error(
      '❌ Este comando BORRA toda la base de datos (menos las APK) y crea el contenido inicial del piloto.\n' +
      `   Base: ${describirDestino(process.env.MONGO_URI)}\n` +
      '   Para hacerlo de verdad: npm run piloto:restablecer -- --confirmar',
    );
    process.exit(1);
  }

  try {
    leerContenidoPiloto(); // falla aquí, sin conectarse, si el .env está incompleto
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`🗄️  Base: ${describirDestino(process.env.MONGO_URI)} · ${mongoose.connection.name}`);
    const resumen = await restablecerPiloto();
    console.log('🧹 Colecciones vaciadas:', resumen.vaciadas);
    console.log(`📦 APK conservadas: ${resumen.apksConservadas}`);
    console.log(`👩‍🏫 Docente: ${resumen.docente}`);
    console.log(`📚 Curso: ${resumen.curso}`);
    resumen.modulos.forEach((m, i) => console.log(`   ${i + 1}. ${m}`));
    console.log(`📝 Reto: ${resumen.tarea}`);
    console.log(`💬 Foro: ${resumen.foro}`);
    console.log('✅ Base restablecida.');
  } catch (error) {
    console.error('❌ No se pudo restablecer:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
