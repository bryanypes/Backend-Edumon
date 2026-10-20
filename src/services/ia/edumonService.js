import FichaCrianza from '../../models/FichaCrianza.js';
import Curso from '../../models/Curso.js';
import Tarea from '../../models/Tarea.js';
import Evento from '../../models/Evento.js';
import { SUBTEMAS } from '../../config/edumonIA.js';
import { clasificar } from './clasificador.js';
import { generarRespuesta } from './generador.js';
import { detectarCharla } from './reglas.js';
import { crearAlertaRiesgo, institucionesDeLaFamilia } from './alertas.js';
import { clasificarRuta } from './rutaAtencion.js';
import {
  respuestaRiesgo,
  RESPUESTA_PEDIR_EDAD,
  RESPUESTA_FUERA_DE_ALCANCE,
  RESPUESTA_NO_HAGO_TAREAS,
  NOTA_ATENCION,
  notaOfrecerAyuda,
  RESPUESTA_AYUDA_SOLICITADA,
  respuestaApoyo,
  respuestaCharla,
} from './respuestasFijas.js';

const MAX_FICHAS = 4;

/**
 * Fichas del subtema que cubren la edad. Si ninguna la cubre, las del mismo
 * subtema (la IA adapta la edad): saltar al eje mezclaría temas distintos.
 * Solo si el subtema no tiene fichas se usan las del eje.
 */
export async function buscarFichas({ eje, subtema }, edad) {
  const filtroEdad = edad == null ? {} : { edadMin: { $lte: edad }, edadMax: { $gte: edad } };

  const delSubtema = await FichaCrianza.find({ activo: true, eje, subtema, ...filtroEdad }).limit(MAX_FICHAS).lean();
  if (delSubtema.length) return delSubtema;

  if (edad != null) {
    const delSubtemaSinEdad = await FichaCrianza.find({ activo: true, eje, subtema }).limit(MAX_FICHAS).lean();
    if (delSubtemaSinEdad.length) return delSubtemaSinEdad;
  }

  return FichaCrianza.find({ activo: true, eje, ...filtroEdad }).limit(MAX_FICHAS).lean();
}

// reto de escuela de padres abierto, del mismo tema, en alguno de los cursos de la
// familia (y asignado a ella); prefiere el mismo subtema, si no, cualquiera del eje
export async function buscarRetoSugerido(usuarioId, { eje, subtema }) {
  const cursos = await Curso.find({ 'participantes.usuarioId': usuarioId, estado: 'activo' }).distinct('_id');
  if (!cursos.length) return null;

  const filtro = {
    'escuelaPadres.eje': eje,
    estado: 'publicada',
    cursoId: { $in: cursos },
    fechaEntrega: { $gt: new Date() },
    $or: [{ asignacionTipo: 'todos' }, { participantesSeleccionados: usuarioId }],
  };
  const reto = await Tarea.findOne({ ...filtro, 'escuelaPadres.subtema': subtema }).sort({ fechaEntrega: 1 }).select('titulo fechaEntrega').lean()
    || await Tarea.findOne(filtro).sort({ fechaEntrega: 1 }).select('titulo fechaEntrega').lean();

  return reto && { tareaId: reto._id, titulo: reto.titulo, fechaEntrega: reto.fechaEntrega };
}

// próximo evento que el docente marcó para recomendar sobre este tema, en alguno
// de los cursos de la familia; prefiere el mismo subtema, si no, cualquiera del eje
export async function buscarEventoSugerido(usuarioId, { eje, subtema }) {
  const cursos = await Curso.find({ 'participantes.usuarioId': usuarioId, estado: 'activo' }).distinct('_id');
  if (!cursos.length) return null;

  const filtro = {
    'escuelaPadres.eje': eje,
    estado: { $in: ['programado', 'en_curso'] },
    cursosIds: { $in: cursos },
    fechaFin: { $gt: new Date() },
  };
  const campos = 'titulo fechaInicio hora ubicacion';
  const evento = await Evento.findOne({ ...filtro, 'escuelaPadres.subtema': subtema }).sort({ fechaInicio: 1 }).select(campos).lean()
    || await Evento.findOne(filtro).sort({ fechaInicio: 1 }).select(campos).lean();

  return evento && {
    eventoId: evento._id,
    titulo: evento.titulo,
    fechaInicio: evento.fechaInicio,
    hora: evento.hora,
    ubicacion: evento.ubicacion,
  };
}

const yaPidioLaEdad = (mensajes) => mensajes.some((m) => m.rol === 'edumon'
  && (m.tipo === 'pedir_edad' || m.contenido?.startsWith(RESPUESTA_PEDIR_EDAD)));

// lo urgente es la seguridad o lo básico del cuidador, no un consejo de crianza
const CATEGORIAS_SOLO_APOYO = ['violencia_intrafamiliar', 'negligencia_grave'];

/**
 * Procesa un mensaje del cuidador y agrega a la conversación tanto ese mensaje
 * como la respuesta de Edumon. Guarda la conversación. Devuelve la respuesta.
 */
export async function procesarMensaje(conversacion, textoActual) {
  const historial = conversacion.mensajes.map((m) => ({ rol: m.rol, contenido: m.contenido, tipo: m.tipo }));
  const clasificacion = await clasificar(textoActual, historial);

  // la familia puede pasar a hablar de otro hijo: vale la última edad mencionada
  if (clasificacion.edad != null) conversacion.edadHijo = clasificacion.edad;

  const riesgoGrave = Boolean(clasificacion.categoriaRiesgo) && clasificacion.gravedad === 'grave';
  const riesgoModerado = Boolean(clasificacion.categoriaRiesgo) && !riesgoGrave;
  const nivelRiesgo = riesgoGrave ? 'riesgo'
    : riesgoModerado ? 'riesgo_moderado'
      : (clasificacion.atencion ? 'atencion' : 'normal');
  conversacion.mensajes.push({
    rol: 'usuario',
    contenido: textoActual,
    nivelRiesgo,
    categoriaRiesgo: clasificacion.categoriaRiesgo ?? null,
    rutaAtencion: clasificarRuta({ categoria: clasificacion.categoriaRiesgo, gravedad: clasificacion.gravedad, texto: textoActual }),
    deteccion: clasificacion.deteccion ?? null,
  });

  let respuesta;

  if (riesgoGrave) {
    // nivel 3: no se aconseja; texto fijo, alerta automática y nada generado por IA
    await crearAlertaRiesgo({
      conversacion,
      categoria: clasificacion.categoriaRiesgo,
      mensajeDisparador: textoActual,
      deteccion: clasificacion.deteccion ?? null,
    });
    respuesta = { contenido: respuestaRiesgo(clasificacion.categoriaRiesgo), esRespuestaRiesgo: true, tipo: 'riesgo' };
  } else if (riesgoModerado && (!clasificacion.tema || CATEGORIAS_SOLO_APOYO.includes(clasificacion.categoriaRiesgo))) {
    // nivel 2 sin un tema de crianza, con violencia de pareja o sin lo básico:
    // apoyo y oferta de ayuda, no consejos de crianza
    respuesta = { contenido: respuestaApoyo(clasificacion.categoriaRiesgo), tipo: 'apoyo' };
  } else if (clasificacion.pideHacerTarea) {
    // límite de Edumon: no resuelve tareas; ofrece cómo acompañar al niño
    respuesta = { contenido: RESPUESTA_NO_HAGO_TAREAS, tipo: 'no_tareas' };
  } else if (!riesgoModerado && detectarCharla(textoActual)) {
    // "hola", "gracias": no es una consulta, no se responde "no tengo información"
    respuesta = { contenido: respuestaCharla(detectarCharla(textoActual)), tipo: 'charla' };
  } else if (!clasificacion.tema) {
    respuesta = { contenido: RESPUESTA_FUERA_DE_ALCANCE, tipo: 'fuera_alcance' };
  } else if (conversacion.edadHijo == null && !yaPidioLaEdad(historial)) {
    // la edad se pide una sola vez por conversación; si no la da, se sigue con ideas generales
    respuesta = { contenido: RESPUESTA_PEDIR_EDAD, tipo: 'pedir_edad' };
  } else {
    const fichas = await buscarFichas(clasificacion.tema, conversacion.edadHijo);
    // en un seguimiento ("ya lo intenté") se prefieren fichas que aún no se usaron
    const yaUsadas = conversacion.mensajes.flatMap((m) => m.fichasIds ?? []).map(String);
    respuesta = fichas.length
      ? { ...(await generarRespuesta({ fichas, edad: conversacion.edadHijo, historial, textoActual, yaUsadas })), tipo: 'respuesta' }
      : { contenido: RESPUESTA_FUERA_DE_ALCANCE, tipo: 'fuera_alcance' };
    if (fichas.length) {
      [respuesta.retoSugerido, respuesta.eventoSugerido] = await Promise.all([
        buscarRetoSugerido(conversacion.usuarioId, clasificacion.tema),
        buscarEventoSugerido(conversacion.usuarioId, clasificacion.tema),
      ]);
    }
  }

  if (riesgoModerado) {
    // nivel 2: se ofrece ayuda; solo se avisa si la familia la pide (y una sola vez)
    const yaPidioAyuda = conversacion.mensajes.some((m) => m.ofrecerAyuda?.solicitada);
    if (respuesta.tipo !== 'apoyo') respuesta.contenido = `${respuesta.contenido}\n\n${notaOfrecerAyuda(clasificacion.categoriaRiesgo)}`;
    if (!yaPidioAyuda) respuesta.ofrecerAyuda = { categoria: clasificacion.categoriaRiesgo, solicitada: false };
    respuesta.atencion = true;
  } else if (clasificacion.atencion && !respuesta.esRespuestaRiesgo) {
    respuesta.contenido = `${respuesta.contenido}\n\n${NOTA_ATENCION}`;
    respuesta.atencion = true;
  }

  // en riesgo el tema detectado puede ser engañoso (abuso → "sexualidad"): título neutro
  if (respuesta.esRespuestaRiesgo) {
    conversacion.titulo = 'Necesito apoyo';
  } else if (clasificacion.tema && conversacion.titulo === 'Nueva conversación') {
    conversacion.titulo = SUBTEMAS[clasificacion.tema.subtema] || conversacion.titulo;
  }

  // las respuestas fijas (riesgo, charla, límites) no las redacta ningún modelo
  respuesta.ia ??= { modo: 'plantilla' };
  conversacion.mensajes.push({ rol: 'edumon', ...respuesta });
  conversacion.ultimaActividad = new Date();
  await conversacion.save();

  return conversacion.mensajes[conversacion.mensajes.length - 1];
}

/**
 * Nivel 2: la familia aceptó que la contacten. Crea la alerta (origen
 * "solicitada") con el mensaje que originó la oferta y deja constancia en el chat.
 * Devuelve el mensaje de confirmación, o null si no había una oferta pendiente.
 */
export async function solicitarAyuda(conversacion) {
  const oferta = [...conversacion.mensajes].reverse()
    .find((m) => m.rol === 'edumon' && m.ofrecerAyuda && !m.ofrecerAyuda.solicitada);
  if (!oferta) return null;

  const indice = conversacion.mensajes.indexOf(oferta);
  const disparador = conversacion.mensajes.slice(0, indice).reverse()
    .find((m) => m.rol === 'usuario' && m.nivelRiesgo === 'riesgo_moderado');

  await crearAlertaRiesgo({
    conversacion,
    categoria: oferta.ofrecerAyuda.categoria,
    mensajeDisparador: disparador?.contenido ?? 'La familia pidió apoyo a través de Edumon.',
    origen: 'solicitada',
    deteccion: disparador?.deteccion ? disparador.deteccion.toObject?.() ?? disparador.deteccion : null,
  });

  oferta.ofrecerAyuda.solicitada = true;
  conversacion.markModified('mensajes');
  conversacion.mensajes.push({ rol: 'edumon', contenido: RESPUESTA_AYUDA_SOLICITADA, tipo: 'apoyo', ia: { modo: 'plantilla' } });
  conversacion.ultimaActividad = new Date();
  await conversacion.save();
  return conversacion.mensajes[conversacion.mensajes.length - 1];
}

// la conversación hereda la institución de los cursos de la familia (el padre no tiene una propia)
export const institucionDeLaConversacion = async (usuarioId, institucionId) =>
  (await institucionesDeLaFamilia(usuarioId, institucionId))[0] ?? null;
