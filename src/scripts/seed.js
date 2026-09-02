/**
 * seed.js — Seeder ÚNICO SOLO PARA TESTEO.
 *
 * Resetea por completo la base apuntada por MONGO_URI (.env) con dropDatabase()
 * y la repuebla con un set MÍNIMO y DETERMINISTA: ~1 registro por colección,
 * con un par extra de docentes/padres/cursos para poder probar permisos entre
 * usuarios distintos.
 *
 * Colecciones cubiertas:
 *   Institucion · User · PerfilFamiliar · Curso · Modulo · Tarea · Entrega ·
 *   Foro · MensajeForo · Evento · Notificacion · Buzon
 *
 * Datos fijos entre corridas: cédulas, teléfonos, correos y nombres NO cambian.
 * Clave de todos los usuarios: Password123*
 *
 * Uso:
 *   node src/scripts/seed.js       (o  npm run seed)
 *
 * Nunca corre con NODE_ENV=production.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

import Institucion from "../models/Institucion.js";
import User from "../models/User.js";
import PerfilFamiliar from "../models/PerfilFamiliar.js";
import Curso from "../models/Curso.js";
import Modulo from "../models/Modulo.js";
import Tarea from "../models/Tarea.js";
import Entrega from "../models/Entrega.js";
import Foro from "../models/Foro.js";
import MensajeForo from "../models/MensajeForo.js";
import Evento from "../models/Evento.js";
import Notificacion from "../models/Notificacion.js";
import Buzon from "../models/Buzon.js";
import { AVATAR_PREDETERMINADO } from "../utils/avatarPredeterminado.js";

dotenv.config();

const PASSWORD = "Password123*"; // misma clave para todos los usuarios de prueba
const dias = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// ─────────────────────────────── seed ───────────────────────────────
async function seed() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ Abortado: NODE_ENV=production. Este seeder es solo para testeo.");
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error("❌ Falta MONGO_URI en el .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const { host, name } = mongoose.connection;
  console.log(`✅ Conectado a MongoDB → ${host} / ${name}\n`);

  console.log("🧹 Reseteando base de datos (dropDatabase)...");
  await mongoose.connection.dropDatabase();
  console.log("   listo.\n");

  // ── 1. Instituciones (2: una completa, otra solo para probar aislamiento) ──
  const instA = await Institucion.create({
    nombre: "Colegio Edumon Demo",
    nit: "900123456-1",
    direccion: "Cra 7 #12-34, Popayán, Cauca",
    telefono: "+573001110000",
    correo: "rectoria@edumon-demo.edu.co",
    activo: true,
  });
  const instB = await Institucion.create({
    nombre: "Liceo Los Andes",
    nit: "900654321-2",
    direccion: "Av. Norte #45-10, Cali, Valle",
    telefono: "+573002220000",
    correo: "info@liceolosandes.edu.co",
    activo: true,
  });

  // ── 2. Usuarios ────────────────────────────────────────────────
  const mk = (data) => User.create({ contraseña: PASSWORD, fotoPerfilUrl: AVATAR_PREDETERMINADO, ...data });

  const superadmin = await mk({
    nombre: "Lucía", apellido: "Torres Ospina", cedula: "100000001",
    correo: "superadmin@edumon.co", telefono: "+573000000001",
    rol: "superadmin", institucionId: null, primerInicioSesion: false,
  });

  const adminA = await mk({
    nombre: "Carlos", apellido: "Mendoza Ruiz", cedula: "100000002",
    correo: "admin.a@edumon-demo.edu.co", telefono: "+573000000002",
    rol: "administrador", institucionId: instA._id, primerInicioSesion: false,
  });
  instA.adminId = adminA._id;
  await instA.save();

  const adminB = await mk({
    nombre: "Patricia", apellido: "Ríos Cárdenas", cedula: "100000003",
    correo: "admin.b@liceolosandes.edu.co", telefono: "+573000000003",
    rol: "administrador", institucionId: instB._id, primerInicioSesion: false,
  });
  instB.adminId = adminB._id;
  await instB.save();

  const docenteA = await mk({
    nombre: "Andrés", apellido: "Gómez Salazar", cedula: "100000010",
    correo: "docente.a@edumon-demo.edu.co", telefono: "+573000000010",
    rol: "docente", institucionId: instA._id, primerInicioSesion: false,
  });
  const docenteB = await mk({
    nombre: "Mariana", apellido: "López Vargas", cedula: "100000011",
    correo: "docente.b@edumon-demo.edu.co", telefono: "+573000000011",
    rol: "docente", institucionId: instA._id, primerInicioSesion: false,
  });

  const padreA = await mk({
    nombre: "Sofía", apellido: "Ramírez Díaz", cedula: "100000020",
    correo: "padre.a@gmail.com", telefono: "+573000000020",
    rol: "padre", institucionId: instA._id, esTitular: true, primerInicioSesion: false,
  });
  const padreB = await mk({
    nombre: "Tomás", apellido: "Castro Rojas", cedula: "100000021",
    correo: "padre.b@gmail.com", telefono: "+573000000021",
    rol: "padre", institucionId: instA._id, esTitular: true, primerInicioSesion: false,
  });

  // ── 3. Perfiles familiares (1 por padre) ───────────────────────
  await PerfilFamiliar.create({ titularId: padreA._id, nombre: "Mateo Ramírez", avatarUrl: AVATAR_PREDETERMINADO, activo: true });
  await PerfilFamiliar.create({ titularId: padreB._id, nombre: "Valentina Castro", avatarUrl: AVATAR_PREDETERMINADO, activo: true });

  // ── 4. Cursos (2, ambos en instA) ─────────────────────────────
  //  curso1: docenteA · participantes = docenteA + padreA + padreB
  //  curso2: docenteB · participantes = docenteB + padreB   (padreA NO está → probar 403)
  const curso1 = await Curso.create({
    nombre: "Matemáticas 5°",
    descripcion: "Curso de Matemáticas de 5° grado: contenidos, tareas y foro de acompañamiento a familias.",
    color: "#3B82F6",
    docenteId: docenteA._id,
    institucionId: instA._id,
    estado: "activo",
    participantes: [
      { usuarioId: docenteA._id, etiqueta: "docente" },
      { usuarioId: padreA._id, etiqueta: "padre" },
      { usuarioId: padreB._id, etiqueta: "padre" },
    ],
  });
  const curso2 = await Curso.create({
    nombre: "Lengua Castellana 5°",
    descripcion: "Curso de Lengua Castellana de 5° grado: lectura, escritura y participación de las familias.",
    color: "#EF4444",
    docenteId: docenteB._id,
    institucionId: instA._id,
    estado: "activo",
    participantes: [
      { usuarioId: docenteB._id, etiqueta: "docente" },
      { usuarioId: padreB._id, etiqueta: "padre" },
    ],
  });

  // ── 5. Módulos (1 por curso) ──────────────────────────────────
  const modulo1 = await Modulo.create({ cursoId: curso1._id, titulo: "Unidad 1 — Números y operaciones", descripcion: "Objetivos y materiales de la unidad 1.", estado: "activo" });
  const modulo2 = await Modulo.create({ cursoId: curso2._id, titulo: "Unidad 1 — Comprensión lectora", descripcion: "Objetivos y materiales de la unidad 1.", estado: "activo" });

  // ── 6. Tareas (1 por módulo: una vigente, una vencida) ─────────
  const tarea1 = await Tarea.create({
    titulo: "Taller de fracciones",
    descripcion: "Resolver el taller adjunto y subir la evidencia en PDF.",
    fechaEntrega: dias(10),
    docenteId: docenteA._id,
    etiquetas: ["práctica", "familia"],
    tipoEntrega: "archivo",
    archivosAdjuntos: [
      { tipo: "archivo", url: "https://res.cloudinary.com/demo/raw/upload/v1/edumon/demo/taller.pdf", nombre: "taller.pdf", publicId: "edumon/demo/taller", formato: "pdf", tamano: 240000 },
      { tipo: "enlace", url: "https://es.khanacademy.org/math/arithmetic-home/arith-review-fractions", nombre: "Repaso de fracciones", descripcion: "Material de apoyo" },
    ],
    criterios: "Puntualidad, presentación y procedimiento completo.",
    estado: "publicada",
    cursoId: curso1._id,
    moduloId: modulo1._id,
    asignacionTipo: "todos",
  });
  const tarea2 = await Tarea.create({
    titulo: "Resumen de la lectura",
    descripcion: "Escribir un resumen de media página sobre la lectura vista en clase.",
    fechaEntrega: dias(-3), // vencida, para probar estado 'tarde'
    docenteId: docenteB._id,
    etiquetas: ["lectura"],
    tipoEntrega: "texto",
    estado: "publicada",
    cursoId: curso2._id,
    moduloId: modulo2._id,
    asignacionTipo: "todos",
  });

  // ── 7. Entregas (a tarea1: una calificada, una pendiente) ──────
  const adjunto = () => ({
    url: "https://res.cloudinary.com/demo/raw/upload/v1/edumon/demo/entrega.pdf",
    publicId: "edumon/demo/entrega_" + Math.random().toString(36).slice(2, 8),
    nombreOriginal: "evidencia.pdf",
    tipoArchivo: "application/pdf",
    tamano: 180000,
  });
  await Entrega.create({
    tareaId: tarea1._id,
    padreId: padreA._id,
    fechaEntrega: dias(-1),
    archivosAdjuntos: [adjunto()],
    textoRespuesta: "Adjunto el taller resuelto en casa con mi hijo.",
    estado: "enviada",
    calificacion: {
      valoracion: 5,
      comentario: "Excelente trabajo, procedimiento claro.",
      fechaCalificacion: new Date(),
      docenteId: docenteA._id,
    },
  });
  await Entrega.create({
    tareaId: tarea1._id,
    padreId: padreB._id,
    fechaEntrega: new Date(),
    archivosAdjuntos: [adjunto()],
    textoRespuesta: "Enviamos la evidencia de la actividad.",
    estado: "enviada",
    // sin calificación → pendiente de revisar
  });

  // ── 8. Foros (1 por curso) ────────────────────────────────────
  const foro1 = await Foro.create({
    titulo: "Dudas de la Unidad 1",
    descripcion: "Espacio para que las familias de Matemáticas 5° compartan inquietudes y aportes.",
    docenteId: docenteA._id,
    cursoId: curso1._id,
    estado: "abierto",
    publico: false,
  });
  const foro2 = await Foro.create({
    titulo: "Acompañamiento en casa",
    descripcion: "Ideas y recursos para reforzar la lectura en casa.",
    docenteId: docenteB._id,
    cursoId: curso2._id,
    estado: "abierto",
    publico: true,
  });

  // ── 9. Mensajes de foro (raíz + respuesta + likes) ────────────
  const msgRaiz = await MensajeForo.create({
    foroId: foro1._id,
    usuarioId: padreA._id,
    contenido: "¿El taller de fracciones se entrega individual o en familia?",
    likes: 1,
    likedBy: [padreB._id],
  });
  await MensajeForo.create({
    foroId: foro1._id,
    usuarioId: docenteA._id,
    contenido: "Puede ser en familia. Lo importante es que se vea el procedimiento.",
    respuestaA: msgRaiz._id,
  });
  await MensajeForo.create({
    foroId: foro2._id,
    usuarioId: docenteB._id,
    contenido: "Les comparto una guía corta de preguntas para conversar la lectura en casa.",
  });

  // ── 10. Eventos (1 por curso; dueño = docente del curso, fecha futura) ──
  const evento1 = await Evento.create({
    titulo: "Escuela de Padres: acompañamiento en tareas",
    descripcion: "Encuentro para las familias de Matemáticas 5°. Se solicita puntualidad y confirmación de asistencia.",
    fechaInicio: dias(7),
    fechaFin: new Date(dias(7).getTime() + 2 * 60 * 60 * 1000),
    hora: "17:00",
    ubicacion: "Auditorio principal",
    docenteId: docenteA._id,
    cursosIds: [curso1._id],
    categoria: "escuela_padres",
  });
  const evento2 = await Evento.create({
    titulo: "Entrega de informes del periodo",
    descripcion: "Atención a padres de Lengua Castellana 5° para la entrega de informes académicos.",
    fechaInicio: dias(14),
    fechaFin: new Date(dias(14).getTime() + 3 * 60 * 60 * 1000),
    hora: "08:00",
    ubicacion: "Aula 204",
    docenteId: docenteB._id,
    cursosIds: [curso2._id],
    categoria: "institucional",
  });

  // ── 11. Notificaciones (una por cada tipo del enum) ───────────
  await Notificacion.insertMany([
    { usuarioId: padreA._id, tipo: "tarea", mensaje: "Nueva tarea en Matemáticas 5°: Taller de fracciones.", referenciaModelo: "Tarea", referenciaId: tarea1._id, prioridad: "media", canalEnviado: { websocket: true } },
    { usuarioId: docenteA._id, tipo: "entrega", mensaje: "Sofía Ramírez realizó una entrega en Taller de fracciones.", referenciaModelo: "Tarea", referenciaId: tarea1._id, prioridad: "media", canalEnviado: { websocket: true } },
    { usuarioId: padreA._id, tipo: "calificacion", mensaje: "Tu entrega de Taller de fracciones fue calificada con 5 estrellas.", referenciaModelo: "Tarea", referenciaId: tarea1._id, leido: true, prioridad: "alta", canalEnviado: { websocket: true, email: true } },
    { usuarioId: padreB._id, tipo: "foro", mensaje: "Nuevo mensaje en el foro 'Dudas de la Unidad 1'.", referenciaModelo: "Foro", referenciaId: foro1._id, prioridad: "baja", canalEnviado: { websocket: true } },
    { usuarioId: padreA._id, tipo: "evento", mensaje: "Nuevo evento: Escuela de Padres (en 7 días).", referenciaModelo: "Evento", referenciaId: evento1._id, prioridad: "media", canalEnviado: { websocket: true } },
    { usuarioId: docenteB._id, tipo: "sistema", mensaje: "Bienvenido a Edumon. Revisa tu perfil y tus cursos.", prioridad: "baja", canalEnviado: { websocket: true } },
  ]);

  // ── 12. Buzón (formulario público de contacto) ────────────────
  await Buzon.insertMany([
    { nombre: "Jorge Pérez", correo: "jorge.perez@example.com", telefono: "+573009990001", institucion: "Colegio San José", mensaje: "Quisiera información para vincular mi institución a la plataforma.", leido: false },
    { nombre: "Ana Muñoz", correo: "ana.munoz@example.com", institucion: "IE Rural La Esperanza", mensaje: "No me llegan las notificaciones por correo, necesito soporte.", leido: true },
  ]);

  // ── Resumen + credenciales ────────────────────────────────────
  const L = (u, nota = "") => `    ${u.correo.padEnd(34)} · ${u.telefono} · céd ${u.cedula}${nota ? "  · " + nota : ""}`;
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("🎉 Seed completado (set mínimo determinista).");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`\n🔑 Clave de TODOS los usuarios:  ${PASSWORD}`);
  console.log("   Login = teléfono + contraseña  (POST /api/auth/login)\n");
  console.log("SUPERADMIN");
  console.log(L(superadmin, "sin institución → no ve cursos"));
  console.log("\nADMINISTRADORES");
  console.log(L(adminA, `${instA.nombre} [${instA.codigo}]`));
  console.log(L(adminB, `${instB.nombre} [${instB.codigo}] — sin cursos (aislamiento)`));
  console.log("\nDOCENTES  (institución: " + instA.nombre + ")");
  console.log(L(docenteA, "dicta 'Matemáticas 5°'"));
  console.log(L(docenteB, "dicta 'Lengua Castellana 5°'"));
  console.log("\nPADRES / ACUDIENTES");
  console.log(L(padreA, "en 'Matemáticas 5°'  (NO en 'Lengua' → probar 403)"));
  console.log(L(padreB, "en 'Matemáticas 5°' y 'Lengua Castellana 5°'"));
  console.log("\nDATOS RELACIONADOS");
  console.log(`    2 cursos · 2 módulos · 2 tareas (1 vigente, 1 vencida) · 2 entregas (1 calificada, 1 pendiente)`);
  console.log(`    2 foros · 3 mensajes · 2 eventos · 6 notificaciones (1 por tipo) · 2 mensajes de buzón · 2 perfiles familiares`);
  console.log("");
}

seed()
  .catch((err) => {
    console.error("\n❌ Error en el seed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log("🔌 Desconectado de MongoDB");
  });
