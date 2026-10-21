/**
 * seedDemo.js — datos de DEMO de Edumon IA (100 % ficticios).
 *
 *   npm run seed:demo
 *
 * - Idempotente: borra y vuelve a crear SOLO los datos de demo (institución con
 *   NIT DEMO-EDUMON-IA y usuarios con correo @demo.edumon.example). Nunca hace
 *   dropDatabase ni toca otros datos.
 * - Corre en modo simulado (sin llaves de IA) para que el resultado sea siempre
 *   el mismo, y pasa los mensajes por el mismo flujo del chat (clasificación,
 *   alertas, bitácora encadenada, ruta de atención, tema por mensaje).
 * - No envía push ni correos: las notificaciones solo quedan guardadas.
 * - Nunca corre con NODE_ENV=production.
 * Usuarios y contraseña: ver DEMO-BACKEND.md.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Institucion from '../models/Institucion.js';
import User from '../models/User.js';
import Curso from '../models/Curso.js';
import Modulo from '../models/Modulo.js';
import Tarea from '../models/Tarea.js';
import ConversacionIA from '../models/ConversacionIA.js';
import ConsentimientoIA from '../models/ConsentimientoIA.js';
import AlertaRiesgo from '../models/AlertaRiesgo.js';
import Notificacion from '../models/Notificacion.js';
import PerfilFamiliar from '../models/PerfilFamiliar.js';
import notificador from '../notifications/NotificadorFacade.js';
import { VERSION_CONSENTIMIENTO } from '../config/edumonIA.js';
import { cargarFichas } from './seedFichas.js';
import { procesarMensaje, solicitarAyuda, institucionDeLaConversacion } from '../services/ia/edumonService.js';
import { encadenar } from '../services/ia/bitacora.js';
import { AVATAR_PREDETERMINADO } from '../utils/avatarPredeterminado.js';
import { limpiarContenido } from './seedContenido.js';

const FAMILIAS = [
  ['Laura', 'Gómez'], ['Carlos', 'Herrera'], ['Natalia', 'Restrepo'], ['Jorge', 'Castillo'], ['Viviana', 'Torres'],
  ['Sebastián', 'Morales'], ['Catalina', 'Ospina'], ['Mauricio', 'Rincón'], ['Paula', 'Jiménez'], ['Andrés', 'Cárdenas'],
  ['Luisa Fernanda', 'Cruz'], ['Diego', 'Salazar'], ['Yolanda', 'Pérez'], ['Fabián', 'Quintero'], ['Marcela', 'Arango'],
  ['Óscar', 'Giraldo'], ['Sandra', 'Londoño'], ['Hernán', 'Valencia'], ['Angélica', 'Mejía'], ['Wilson', 'Ruiz'],
];

export const NIT_DEMO = 'DEMO-EDUMON-IA';
export const DOMINIO_DEMO = '@demo.edumon.example';
// contraseña de ejemplo de los usuarios de demo (documentada en DEMO-BACKEND.md)
// En un despliegue público se cambia con SEED_DEMO_PASSWORD (no se versiona)
export const CLAVE_DEMO = process.env.SEED_DEMO_PASSWORD || 'EdumonDemo2026*';
const dias = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// ── Lo que escribe cada familia (ficticio). Los temas se eligen para que el
//    Ciclo Edumon tenga datos: un tema solo se muestra con 5 familias o más.
const CONSULTAS = {
  pantallas: ['mi hijo no suelta el celular', 'mi hijo de 10 pasa todo el día con videojuegos', 'mi hija no suelta la tablet ni para comer', '¿a qué edad le doy celular a mi hija?', 'mi hijo tiene 13 y quiere abrir tiktok', 'le dejo 2-3 horas de celular los sábados'],
  sueno: ['le cuesta dormirse en la noche', 'mi hijo no quiere dormir en su cama', 'se despierta con pesadillas', 'tiene cinco años y todavía moja la cama', 'le cuesta dormirse y se levanta cansado'],
  rabietas: ['mi hija de 4 años hace rabietas muy fuertes', 'mi hija de 2 años hace berrinches en el supermercado', 'hace pataletas cada mañana', 'mi hijo hace rabietas cuando apago la tele', 'mi niña hace berrinches por todo'],
  comunicacion_adolescentes: ['mi hijo adolescente ya no me cuenta nada', 'mi hijo de 16 se encierra en su cuarto y no habla', 'mi hija de 15 ya no me cuenta nada', 'mi hijo adolescente no me habla', 'mi hija adolescente ya no me cuenta sus cosas'],
  consumo_sustancias: ['encontré un vapeador en la maleta de mi hijo', 'mi hijo de 15 llegó borracho de una fiesta'],
};

async function limpiarDemo() {
  const inst = await Institucion.findOne({ nit: NIT_DEMO }).select('_id').lean();
  const usuarios = await User.find({ correo: { $regex: `${DOMINIO_DEMO.replace(/\./g, '\\.')}$` } }).distinct('_id');
  const cursos = inst ? await Curso.find({ institucionId: inst._id }).distinct('_id') : [];
  await limpiarContenido({ institucionId: inst?._id, cursosIds: cursos, usuariosIds: usuarios });
  await Promise.all([
    Tarea.deleteMany({ cursoId: { $in: cursos } }),
    Modulo.deleteMany({ cursoId: { $in: cursos } }),
    ConversacionIA.deleteMany({ usuarioId: { $in: usuarios } }),
    ConsentimientoIA.deleteMany({ usuarioId: { $in: usuarios } }),
    Notificacion.deleteMany({ usuarioId: { $in: usuarios } }),
    PerfilFamiliar.deleteMany({ titularId: { $in: usuarios } }),
    inst ? AlertaRiesgo.deleteMany({ institucionId: inst._id }) : null,
  ]);
  await Curso.deleteMany({ _id: { $in: cursos } });
  await User.deleteMany({ _id: { $in: usuarios } });
  if (inst) await Institucion.deleteOne({ _id: inst._id });
  return { usuarios: usuarios.length, cursos: cursos.length };
}

export async function sembrarDemo({ log = console.log } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Abortado: NODE_ENV=production. El seed de demo es solo para la demo.');
  // modo simulado: resultado determinista aunque el .env tenga llaves
  process.env.GROQ_API_KEY = '';
  process.env.OPENAI_API_KEY = '';
  // sin push ni correos: las notificaciones solo se guardan
  notificador.estrategias = [];

  const borrado = await limpiarDemo();
  log(`🧹 Datos de demo anteriores borrados (${borrado.usuarios} usuarios, ${borrado.cursos} cursos)`);
  await cargarFichas();

  let n = 0;
  const mk = (rol, nombre, apellido, extra = {}) => {
    n += 1;
    const sufijo = String(n).padStart(2, '0');
    return User.create({
      nombre, apellido, rol,
      cedula: `9990000${sufijo}`,
      correo: `${rol}${sufijo}${DOMINIO_DEMO}`,
      telefono: `+57300999${String(n).padStart(4, '0')}`,
      contraseña: CLAVE_DEMO,
      fotoPerfilUrl: AVATAR_PREDETERMINADO,
      primerInicioSesion: false,
      ...extra,
    });
  };

  const inst = await Institucion.create({
    nombre: 'Colegio Valle Verde', nit: NIT_DEMO, direccion: 'Calle 12 # 8-45, Popayán', telefono: '+573009990000',
    correo: `rectoria${DOMINIO_DEMO}`, activo: true,
  });
  const rectora = await mk('administrador', 'Marcela', 'Ríos Castaño', { institucionId: inst._id });
  const orientadora = await mk('docente', 'Diana Patricia', 'Muñoz', { institucionId: inst._id });
  inst.adminId = rectora._id;
  inst.responsableConvivenciaId = orientadora._id;
  await inst.save();

  const docentes = await Promise.all([
    mk('docente', 'Andrés Felipe', 'Ramírez', { institucionId: inst._id }),
    mk('docente', 'Paola Andrea', 'Vélez', { institucionId: inst._id }),
    mk('docente', 'Juan Camilo', 'Ortiz', { institucionId: inst._id }),
  ]);
  // 7 familias por curso; la familia 1 de Quinto también está en Tercero
  const familias = [];
  for (const [nombre, apellido] of FAMILIAS) familias.push(await mk('padre', nombre, apellido));

  const NOMBRES = ['Grado Quinto A', 'Grado Tercero B', 'Grado Noveno A'];
  const grupos = [familias.slice(0, 7), [familias[0], ...familias.slice(7, 13)], familias.slice(13, 20)];
  const cursos = await Promise.all(NOMBRES.map((nombre, i) => Curso.create({
    nombre, descripcion: `Curso ficticio de demo: ${nombre}.`, docenteId: docentes[i]._id, institucionId: inst._id, estado: 'activo',
    participantes: [
      { usuarioId: docentes[i]._id, etiqueta: 'docente' },
      ...grupos[i].map((f) => ({ usuarioId: f._id, etiqueta: 'padre' })),
    ],
  })));
  const modulo = await Modulo.create({ cursoId: cursos[0]._id, titulo: 'Uso responsable de pantallas', descripcion: 'Módulo de demo.', estado: 'activo' });
  await Tarea.create({
    titulo: 'Reto: una hora sin pantallas en familia', descripcion: 'Reto de demo.', fechaEntrega: dias(10), docenteId: docentes[0]._id,
    cursoId: cursos[0]._id, moduloId: modulo._id, tipoEntrega: 'texto', estado: 'publicada', asignacionTipo: 'todos',
    escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'pantallas' },
  });

  await ConsentimientoIA.insertMany(familias.map((f) => ({ usuarioId: f._id, perfilId: null, version: VERSION_CONSENTIMIENTO })));

  const conversar = async (familia, mensajes) => {
    const conv = await ConversacionIA.create({
      usuarioId: familia._id,
      institucionId: await institucionDeLaConversacion(familia._id, null),
    });
    for (const texto of mensajes) await procesarMensaje(conv, texto);
    return conv;
  };

  // ── Temas (Ciclo Edumon) ──
  const [quinto, tercero, noveno] = grupos;
  await Promise.all([
    ...quinto.slice(0, 6).map((f, i) => conversar(f, [CONSULTAS.pantallas[i]])),
    ...quinto.slice(1, 6).map((f, i) => conversar(f, [CONSULTAS.sueno[i]])),
    ...tercero.slice(1, 6).map((f, i) => conversar(f, [CONSULTAS.rabietas[i]])),
    ...noveno.slice(0, 5).map((f, i) => conversar(f, [CONSULTAS.comunicacion_adolescentes[i]])),
    // menos de 5 familias: queda oculto en el ciclo
    ...noveno.slice(5, 7).map((f, i) => conversar(f, [CONSULTAS.consumo_sustancias[i]])),
  ]);

  // ── Alertas: una por ámbito y una de cada tipo Ley 1620 ──
  const alertas = {};
  const alertaDe = async (conv) => AlertaRiesgo.findOne({ conversacionId: conv._id }).sort({ createdAt: -1 });
  alertas.tipoIII = await alertaDe(await conversar(quinto[6], ['el profesor de música le tocó los senos a mi hija']));
  const convII = await conversar(tercero[6], ['la profesora le dice estúpido todos los días']);
  await solicitarAyuda(convII);
  alertas.tipoII = await alertaDe(convII);
  const convI = await conversar(noveno[6], ['el profe le dijo bruto delante del salón']);
  await solicitarAyuda(convI);
  alertas.tipoI = await alertaDe(convI);
  alertas.hogar = await alertaDe(await conversar(quinto[3], ['creo que abusaron de mi hija']));
  alertas.personal = await alertaDe(await conversar(noveno[2], ['me kiero matar ya no puedo mas']));

  // una alerta ya en atención, con su bitácora encadenada
  if (alertas.hogar) {
    const eventos = encadenar(alertas.hogar, alertas.hogar.historial, [
      { accion: 'estado', estado: 'en_atencion', nota: 'Orientación contactó a la familia (demo).', por: orientadora._id },
      { accion: 'nota', nota: 'Se activó la ruta con las autoridades competentes (demo).', por: orientadora._id },
    ]);
    alertas.hogar.historial.push(...eventos);
    alertas.hogar.estado = 'en_atencion';
    alertas.hogar.atendidaPor = orientadora._id;
    alertas.hogar.atendidaEn = new Date();
    await alertas.hogar.save();
  }

  const resumen = {
    institucion: inst.nombre,
    cursos: cursos.map((c, i) => ({ nombre: c.nombre, cursoId: String(c._id), familias: grupos[i].length })),
    usuarios: { rectora: rectora.telefono, orientadora: orientadora.telefono, docentes: docentes.map((d) => d.telefono), familias: familias.map((f) => f.telefono) },
    alertas: Object.fromEntries(Object.entries(alertas).map(([k, a]) => [k, a ? { alertaId: String(a._id), ambito: a.rutaAtencion?.ambito, tipoLey1620: a.rutaAtencion?.tipoLey1620 ?? null } : null])),
  };
  log(`✅ Demo lista: ${familias.length} familias, ${cursos.length} cursos, ${Object.values(alertas).filter(Boolean).length} alertas`);
  return resumen;
}

const ejecutadoDirecto = process.argv[1]?.endsWith('seedDemo.js');
if (ejecutadoDirecto) {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log(JSON.stringify(await sembrarDemo(), null, 2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
