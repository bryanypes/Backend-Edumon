import FichaCrianza from '../../models/FichaCrianza.js';
import { ETIQUETAS_CATEGORIA } from './alertas.js';

// "¿Por qué Edumon dijo esto?": arma la explicación de un mensaje a partir de
// lo que ya quedó guardado al responder (detección, fichas, proveedor). No
// vuelve a llamar a la IA: explica lo que pasó, no lo que pasaría ahora.

// quién determinó el riesgo, en los términos de la pantalla
const QUIEN = { regla: 'regla', ia: 'modelo', regla_confirmada_por_ia: 'ambos' };

const NIVEL = {
  normal: 'Consulta habitual de crianza',
  atencion: 'Consulta con señales de malestar: se sugirió hablar con orientación escolar',
  riesgo_moderado: 'Posible riesgo moderado: se ofreció contactar al colegio solo si la familia lo pide',
  riesgo: 'Posible riesgo grave: se avisó automáticamente al colegio',
};

const MODO_RESPUESTA = {
  llm: 'La redactó un modelo de IA usando solo las fichas curadas',
  fichas_fallback: 'Los proveedores de IA no respondieron: se mostró la ficha curada tal cual',
  simulado: 'Modo sin IA: se mostró la ficha curada más pertinente',
  plantilla: 'Es un texto fijo revisado de antemano; ningún modelo lo redactó',
};

const hallazgo = (h) => (h ? {
  categoria: h.categoria,
  gravedad: h.gravedad,
  fragmento: h.patron ?? null,
  aproximado: Boolean(h.aproximado),
  correcciones: h.correcciones ?? [],
} : null);

function quienDecidio(deteccion) {
  if (!deteccion) return null;
  if (deteccion.decidio) return QUIEN[deteccion.decidio] ?? null;
  // sin riesgo: quién clasificó el mensaje
  return deteccion.fuente === 'ia' ? 'modelo' : 'regla';
}

function resumen({ nivelRiesgo, decidio, deteccion, respuesta, fichas, rutaAtencion }) {
  const frases = [NIVEL[nivelRiesgo] ?? 'Mensaje clasificado'];
  if (deteccion?.reglaSegura?.patron && decidio !== 'modelo') {
    frases.push(deteccion.reglaSegura.aproximado
      ? `Una regla de seguridad reconoció "${deteccion.reglaSegura.patron}" corrigiendo la ortografía (${(deteccion.reglaSegura.correcciones ?? []).map((c) => `${c.de} → ${c.a}`).join(', ')}).`
      : `Una regla de seguridad reconoció "${deteccion.reglaSegura.patron}".`);
  }
  if (decidio === 'ambos') frases.push('El modelo de IA confirmó el indicio de la regla.');
  if (decidio === 'modelo') frases.push('El modelo de IA identificó el riesgo.');
  if (deteccion?.fuente === 'reglas' && deteccion?.errorIA) frases.push(`La IA no estaba disponible (${deteccion.errorIA}); decidieron las reglas.`);
  if (respuesta?.ia?.modo) frases.push(`${MODO_RESPUESTA[respuesta.ia.modo]}.`);
  if (fichas.length) frases.push(`Fichas usadas: ${fichas.map((f) => f.titulo).join('; ')}.`);
  if (rutaAtencion?.protocolo) frases.push(`Ruta sugerida: ${rutaAtencion.protocolo}.`);
  return frases.join(' ');
}

/**
 * Explica un mensaje de la conversación (el del cuidador o la respuesta de Edumon).
 * @returns {object|null} null si el mensaje no existe en la conversación
 */
export async function explicarMensaje(conversacion, mensajeId) {
  const mensajes = conversacion.mensajes ?? [];
  const indice = mensajes.findIndex((m) => String(m._id) === String(mensajeId));
  if (indice === -1) return null;

  const elegido = mensajes[indice];
  const usuario = elegido.rol === 'usuario'
    ? elegido
    : mensajes.slice(0, indice).reverse().find((m) => m.rol === 'usuario') ?? null;
  const respuesta = elegido.rol === 'edumon'
    ? elegido
    : mensajes.slice(indice + 1).find((m) => m.rol === 'edumon') ?? null;

  const ids = respuesta?.fichasIds ?? [];
  const fichas = ids.length
    ? await FichaCrianza.find({ _id: { $in: ids } }).select('titulo eje subtema fuente edadMin edadMax').lean()
    : [];
  const deteccion = usuario?.deteccion ?? null;
  const decidio = quienDecidio(deteccion);
  const nivelRiesgo = usuario?.nivelRiesgo ?? null;
  // categoría final guardada en el mensaje; en mensajes viejos se deduce de la detección
  const categoria = usuario?.categoriaRiesgo
    ?? respuesta?.ofrecerAyuda?.categoria
    ?? deteccion?.reglaSegura?.categoria
    ?? (deteccion?.llm?.categoria && deteccion.llm.categoria !== 'ninguna' ? deteccion.llm.categoria : null);
  const rutaAtencion = usuario?.rutaAtencion ?? null;

  return {
    mensajeId: usuario?._id ?? null,
    respuestaId: respuesta?._id ?? null,
    nivelRiesgo,
    riesgo: nivelRiesgo === 'riesgo' || nivelRiesgo === 'riesgo_moderado'
      ? { categoria, etiqueta: ETIQUETAS_CATEGORIA[categoria] ?? null, gravedad: nivelRiesgo === 'riesgo' ? 'grave' : 'moderado' }
      : null,
    decidio,
    seNotificoAlColegio: nivelRiesgo === 'riesgo' || Boolean(mensajes.slice(indice).some((m) => m.ofrecerAyuda?.solicitada)),
    rutaAtencion,
    clasificacion: deteccion && {
      fuente: deteccion.fuente,
      proveedor: deteccion.proveedor ?? null,
      modelo: deteccion.modelo ?? null,
      latenciaMs: deteccion.latenciaMs ?? null,
      huboFallback: Boolean(deteccion.huboFallback),
      desdeCache: Boolean(deteccion.desdeCache),
      reglaSegura: hallazgo(deteccion.reglaSegura),
      reglaDudosa: hallazgo(deteccion.reglaDudosa),
      modeloDijo: deteccion.llm ?? null,
      errorIA: deteccion.errorIA ?? null,
    },
    respuesta: respuesta && {
      tipo: respuesta.tipo ?? null,
      modo: respuesta.ia?.modo ?? null,
      proveedor: respuesta.ia?.proveedor ?? null,
      modelo: respuesta.ia?.modelo ?? null,
      latenciaMs: respuesta.ia?.latenciaMs ?? null,
      huboFallback: Boolean(respuesta.ia?.huboFallback),
      esTextoFijo: Boolean(respuesta.esRespuestaRiesgo) || respuesta.ia?.modo === 'plantilla',
    },
    fichas: fichas.map((f) => ({ _id: f._id, titulo: f.titulo, eje: f.eje, subtema: f.subtema, edades: [f.edadMin, f.edadMax], fuente: f.fuente ?? null })),
    fuentes: respuesta?.fuentes ?? [],
    resumen: resumen({ nivelRiesgo, decidio, deteccion, respuesta, fichas, rutaAtencion }),
  };
}

/** Explica por qué se generó una alerta (para el colegio). */
export function explicarAlerta(alerta) {
  const deteccion = alerta.deteccion ?? null;
  const decidio = alerta.origen === 'solicitada' ? 'familia' : quienDecidio(deteccion);
  return {
    alertaId: alerta._id,
    origen: alerta.origen,
    categoria: alerta.categoria,
    etiqueta: ETIQUETAS_CATEGORIA[alerta.categoria] ?? null,
    decidio,
    mensajeDisparador: alerta.mensajeDisparador,
    rutaAtencion: alerta.rutaAtencion ?? null,
    clasificacion: deteccion && {
      fuente: deteccion.fuente,
      proveedor: deteccion.proveedor ?? null,
      modelo: deteccion.modelo ?? null,
      huboFallback: Boolean(deteccion.huboFallback),
      reglaSegura: hallazgo(deteccion.reglaSegura),
      reglaDudosa: hallazgo(deteccion.reglaDudosa),
      modeloDijo: deteccion.llm ?? null,
      errorIA: deteccion.errorIA ?? null,
    },
    resumen: alerta.origen === 'solicitada'
      ? 'La familia pidió que el colegio la contactara después de que Edumon le ofreciera ayuda.'
      : resumen({ nivelRiesgo: 'riesgo', decidio, deteccion, respuesta: null, fichas: [], rutaAtencion: alerta.rutaAtencion }),
  };
}
