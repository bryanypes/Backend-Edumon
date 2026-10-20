import mongoose from 'mongoose';
import ConversacionIA from '../../models/ConversacionIA.js';
import Tarea from '../../models/Tarea.js';
import Modulo from '../../models/Modulo.js';
import { SUBTEMAS, EJES_LABELS, DIAS_RETENCION_CONVERSACIONES } from '../../config/edumonIA.js';
import { sugerirModulos } from './sugerenciasModulos.js';
import { generarRetoEscuelaPadres } from './retoEscuelaPadres.js';

// Ciclo Edumon: lo que las familias de un curso consultan → sugerencia de
// módulo y reto para el docente → retos creados sobre ese tema.
//
// Privacidad (decisiones documentadas):
// - Solo se agrega la ETIQUETA del tema que guardó el clasificador en cada
//   mensaje (eje/subtema), nunca el texto.
// - "Familia" = usuarioId del titular: los perfiles de una misma familia
//   cuentan como una sola.
// - Un tema solo se muestra si lo consultaron al menos MIN_FAMILIAS familias
//   distintas; si no, no se devuelve ni su conteo (solo se indica que hay temas
//   ocultos).
// - Ventana: los últimos 30 días, que es lo que duran las conversaciones
//   (TTL de ConversacionIA); no se guarda historia aparte.
// - Si una familia está en varios cursos activos, sus temas cuentan en todos.

export const MIN_FAMILIAS = 5;

const familiasDelCurso = (curso) => [...new Set((curso.participantes ?? [])
  .filter((p) => p.etiqueta === 'padre')
  .map((p) => String(p.usuarioId)))];

/** Temas anónimos del curso (≥ MIN_FAMILIAS familias distintas por tema). */
export async function temasDelCurso(curso, { ahora = new Date() } = {}) {
  const familias = familiasDelCurso(curso);
  const desde = new Date(ahora.getTime() - DIAS_RETENCION_CONVERSACIONES * 24 * 60 * 60 * 1000);
  if (!familias.length) return { temas: [], hayTemasOcultos: false, desde };

  const filas = await ConversacionIA.aggregate([
    { $match: { usuarioId: { $in: familias.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $unwind: '$mensajes' },
    { $match: { 'mensajes.rol': 'usuario', 'mensajes.tema.subtema': { $type: 'string' }, 'mensajes.creadoEn': { $gte: desde } } },
    { $group: { _id: { eje: '$mensajes.tema.eje', subtema: '$mensajes.tema.subtema' }, familias: { $addToSet: '$usuarioId' } } },
    { $project: { _id: 0, eje: '$_id.eje', subtema: '$_id.subtema', familias: { $size: '$familias' } } },
  ]);

  const visibles = filas
    .filter((f) => f.familias >= MIN_FAMILIAS)
    .sort((a, b) => b.familias - a.familias || a.subtema.localeCompare(b.subtema))
    .map((f) => ({ ...f, subtemaLabel: SUBTEMAS[f.subtema] ?? f.subtema, ejeLabel: EJES_LABELS[f.eje] ?? f.eje }));

  return { temas: visibles, hayTemasOcultos: filas.length > visibles.length, desde };
}

/** Retos del curso ya creados sobre cada tema (para cerrar el ciclo). */
export async function retosPorTema(curso, temas) {
  if (!temas.length) return {};
  const retos = await Tarea.find({
    cursoId: curso._id,
    'escuelaPadres.subtema': { $in: temas.map((t) => t.subtema) },
    estado: { $ne: 'cerrada' },
  }).select('titulo estado fechaEntrega escuelaPadres').sort({ fechaEntrega: 1 }).lean();
  const porTema = {};
  for (const r of retos) {
    (porTema[r.escuelaPadres.subtema] ??= []).push({ tareaId: r._id, titulo: r.titulo, estado: r.estado, fechaEntrega: r.fechaEntrega });
  }
  return porTema;
}

/** Vista del ciclo: temas → retos creados. */
export async function vistaCiclo(curso) {
  const { temas, hayTemasOcultos, desde } = await temasDelCurso(curso);
  const retos = await retosPorTema(curso, temas);
  return {
    curso: { _id: curso._id, nombre: curso.nombre },
    ventana: { desde, dias: DIAS_RETENCION_CONVERSACIONES },
    minimoFamilias: MIN_FAMILIAS,
    hayTemasOcultos,
    temas: temas.map((t) => ({ ...t, retosCreados: retos[t.subtema] ?? [] })),
  };
}

/**
 * Sugerencia para el docente a partir del tema principal del curso: módulos
 * (sugerirModulos) y un borrador de reto (generador existente).
 * @returns {null} si el curso no tiene ningún tema visible
 */
export async function sugerenciaCiclo(curso) {
  const { temas } = await temasDelCurso(curso);
  if (!temas.length) return null;
  const [principal] = temas;
  const existentes = await Modulo.find({ cursoId: curso._id }).distinct('titulo');
  const contexto = `Temas que más consultan las familias de este curso: ${temas.slice(0, 3).map((t) => t.subtemaLabel).join(', ')}.`;

  const [modulos, reto] = await Promise.all([
    sugerirModulos({ curso: curso.nombre, existentes, contexto }),
    generarRetoEscuelaPadres({ eje: principal.eje, subtema: principal.subtema, curso: curso.nombre }),
  ]);
  return {
    basadoEn: { eje: principal.eje, subtema: principal.subtema, subtemaLabel: principal.subtemaLabel, familias: principal.familias },
    modulos,
    reto,
  };
}
