import User from '../../src/models/User.js';
import Institucion from '../../src/models/Institucion.js';
import Curso from '../../src/models/Curso.js';
import Modulo from '../../src/models/Modulo.js';
import Tarea from '../../src/models/Tarea.js';
import Entrega from '../../src/models/Entrega.js';
import Foro from '../../src/models/Foro.js';
import MensajeForo from '../../src/models/MensajeForo.js';
import Evento from '../../src/models/Evento.js';
import PerfilFamiliar from '../../src/models/PerfilFamiliar.js';
import Buzon from '../../src/models/Buzon.js';

// Contraseña que cumple el mínimo del schema (6) y las reglas del validator de registro.
export const CONTRASEÑA_PRUEBA = 'ClaveSegura123';

let contador = 0;
const siguiente = () => (contador += 1);

/** +57 seguido de 10 dígitos (empieza en 3) — formato canónico que exige loginValidator/registerValidator */
export const telefonoDePrueba = () => `+57${String(3000000000 + siguiente()).padStart(10, '0')}`;

/** 6-10 dígitos — formato que exige el validador de User.cedula */
export const cedulaDePrueba = () => String(10000000 + siguiente());

export async function crearInstitucion(overrides = {}) {
  const n = siguiente();
  return Institucion.create({
    nombre: `Institución de Prueba ${n}`,
    nit: `NIT-${n}`,
    direccion: 'Calle Falsa 123',
    telefono: telefonoDePrueba(),
    correo: `institucion${n}@test.edumon.com`,
    ...overrides,
  });
}

export async function crearUsuario(rol, overrides = {}) {
  const n = siguiente();
  const datos = {
    nombre: 'Usuario',
    apellido: `Prueba${n}`,
    cedula: cedulaDePrueba(),
    correo: `usuario${n}@test.edumon.com`,
    contraseña: CONTRASEÑA_PRUEBA,
    rol,
    telefono: telefonoDePrueba(),
    institucionId: null,
    estado: 'activo',
    ...overrides,
  };
  const user = new User(datos);
  await user.save();
  return user;
}

export const crearPadre = (overrides) => crearUsuario('padre', overrides);
export const crearDocente = (overrides) => crearUsuario('docente', overrides);
export const crearAdministrador = (overrides) => crearUsuario('administrador', overrides);
export const crearSuperadmin = (overrides) => crearUsuario('superadmin', overrides);

export async function crearCurso(overrides = {}) {
  const n = siguiente();
  let institucionId = overrides.institucionId;
  let docenteId = overrides.docenteId;

  if (!institucionId) institucionId = (await crearInstitucion())._id;
  if (!docenteId) docenteId = (await crearDocente({ institucionId }))._id;

  const curso = await Curso.create({
    nombre: `Curso de Prueba ${n}`,
    descripcion: 'Curso creado para pruebas automatizadas',
    docenteId,
    institucionId,
    participantes: [{ usuarioId: docenteId, etiqueta: 'docente' }],
    ...overrides,
  });
  return curso;
}

export async function crearModulo(overrides = {}) {
  const n = siguiente();
  let cursoId = overrides.cursoId;
  if (!cursoId) cursoId = (await crearCurso())._id;

  return Modulo.create({
    cursoId,
    titulo: `Módulo de Prueba ${n}`,
    descripcion: 'Módulo creado para pruebas automatizadas',
    ...overrides,
  });
}

// A las funciones "creadoras internas" de abajo (crearModulo, crearCurso...) NUNCA
// se les pasa una clave con valor `undefined` explícito (ej. `{ cursoId: undefined }`):
// el spread SÍ copia claves cuyo valor es `undefined` si la clave existe en el
// objeto, y eso pisaría el valor por defecto que esa función ya calculó. Por
// eso los helpers de abajo arman el objeto condicionalmente (`cursoId ? {cursoId} : {}`)
// en vez de pasar `{ cursoId }` a secas.

export async function crearTarea(overrides = {}) {
  const n = siguiente();
  let moduloId = overrides.moduloId;
  let cursoId = overrides.cursoId;
  let docenteId = overrides.docenteId;

  if (!moduloId) {
    const modulo = await crearModulo(cursoId ? { cursoId } : {});
    moduloId = modulo._id;
    cursoId = cursoId || modulo.cursoId;
  }
  if (!cursoId) {
    const modulo = await Modulo.findById(moduloId);
    cursoId = modulo.cursoId;
  }
  if (!docenteId) {
    const curso = await Curso.findById(cursoId);
    docenteId = curso.docenteId;
  }

  return Tarea.create({
    titulo: `Tarea de Prueba ${n}`,
    descripcion: 'Tarea creada para pruebas automatizadas',
    fechaEntrega: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    docenteId,
    cursoId,
    moduloId,
    tipoEntrega: 'texto',
    asignacionTipo: 'todos',
    ...overrides,
  });
}

export async function crearEntrega(overrides = {}) {
  let tareaId = overrides.tareaId;
  let padreId = overrides.padreId;

  if (!tareaId) tareaId = (await crearTarea())._id;
  if (!padreId) padreId = (await crearPadre())._id;

  return Entrega.create({
    tareaId,
    padreId,
    textoRespuesta: 'Respuesta de prueba',
    estado: 'borrador',
    ...overrides,
  });
}

export async function crearForo(overrides = {}) {
  const n = siguiente();
  let cursoId = overrides.cursoId;
  let docenteId = overrides.docenteId;

  if (!cursoId) {
    const curso = await crearCurso(docenteId ? { docenteId } : {});
    cursoId = curso._id;
    docenteId = docenteId || curso.docenteId;
  }
  if (!docenteId) {
    const curso = await Curso.findById(cursoId);
    docenteId = curso.docenteId;
  }

  return Foro.create({
    titulo: `Foro de Prueba ${n}`,
    descripcion: 'Foro creado para pruebas automatizadas',
    docenteId,
    cursoId,
    ...overrides,
  });
}

export async function crearMensajeForo(overrides = {}) {
  let foroId = overrides.foroId;
  let usuarioId = overrides.usuarioId;

  if (!foroId) foroId = (await crearForo())._id;
  if (!usuarioId) {
    const foro = await Foro.findById(foroId);
    usuarioId = foro.docenteId;
  }

  return MensajeForo.create({
    foroId,
    usuarioId,
    contenido: 'Mensaje de prueba',
    ...overrides,
  });
}

export async function crearEvento(overrides = {}) {
  const n = siguiente();
  let cursosIds = overrides.cursosIds;
  let docenteId = overrides.docenteId;

  if (!cursosIds) {
    const curso = await crearCurso(docenteId ? { docenteId } : {});
    cursosIds = [curso._id];
    docenteId = docenteId || curso.docenteId;
  }
  if (!docenteId) {
    const curso = await Curso.findById(cursosIds[0]);
    docenteId = curso.docenteId;
  }

  return Evento.create({
    titulo: `Evento de Prueba ${n}`,
    descripcion: 'Evento creado para pruebas automatizadas',
    fechaInicio: new Date(Date.now() + 24 * 60 * 60 * 1000),
    fechaFin: new Date(Date.now() + 26 * 60 * 60 * 1000),
    hora: '10:00',
    ubicacion: 'Auditorio principal',
    docenteId,
    cursosIds,
    categoria: 'institucional',
    ...overrides,
  });
}

export async function crearPerfilFamiliar(overrides = {}) {
  let titularId = overrides.titularId;
  if (!titularId) titularId = (await crearPadre())._id;

  return PerfilFamiliar.create({
    titularId,
    nombre: 'Hijo de Prueba',
    ...overrides,
  });
}

export async function crearMensajeBuzon(overrides = {}) {
  const n = siguiente();
  return Buzon.create({
    nombre: `Interesado ${n}`,
    correo: `interesado${n}@test.edumon.com`,
    telefono: telefonoDePrueba(),
    mensaje: 'Mensaje de contacto de prueba con contenido suficiente.',
    ...overrides,
  });
}
