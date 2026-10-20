import { createHash } from 'node:crypto';

// Bitácora inmutable de las alertas de riesgo.
//
// Cada evento del historial (creación, cambio de estado, nota) guarda
// hash = SHA-256(seq, accion, estado, nota, por, en, hashAnterior), y el primer
// evento se encadena a un "génesis" calculado con los datos de la alerta que
// nunca cambian (id, institución, familia, categoría, origen y mensaje que la
// disparó). Si alguien edita directamente en la base de datos un evento, el
// mensaje disparador o la categoría, o borra o reordena eventos, la cadena deja
// de cuadrar y verificarCadena() dice en qué evento se rompe.
//
// Límite conocido: no detecta que se borre la alerta COMPLETA (la cadena es por
// alerta). Queda en la hoja de ruta (anclar los hashes en una cadena global).

const sha256 = (texto) => createHash('sha256').update(texto).digest('hex');
const id = (valor) => (valor == null ? null : String(valor._id ?? valor));
const fecha = (valor) => (valor == null ? null : new Date(valor).toISOString());

export const hashGenesis = (alerta) => sha256(JSON.stringify([
  'edumon:alerta:v1',
  id(alerta._id),
  id(alerta.institucionId),
  id(alerta.usuarioId),
  alerta.categoria,
  alerta.origen ?? 'automatica',
  // Mongoose recorta los textos al guardar: el hash usa el mismo valor que queda guardado
  String(alerta.mensajeDisparador ?? '').trim(),
]));

export const hashEvento = (evento, seq, hashAnterior) => sha256(JSON.stringify([
  seq,
  evento.accion,
  evento.estado ?? null,
  String(evento.nota ?? '').trim(),
  id(evento.por),
  fecha(evento.en),
  hashAnterior,
]));

/**
 * Agrega a `eventosNuevos` los campos seq, hashAnterior y hash, encadenados
 * después de `historialActual` (que ya debe estar encadenado).
 * `en` se fija aquí si falta, porque forma parte del hash.
 */
export function encadenar(alerta, historialActual, eventosNuevos) {
  let anterior = historialActual.length ? historialActual.at(-1).hash : hashGenesis(alerta);
  let seq = historialActual.length;
  return eventosNuevos.map((evento) => {
    const completo = { ...evento, en: evento.en ?? new Date() };
    const hash = hashEvento(completo, seq, anterior);
    const encadenado = { ...completo, seq, hashAnterior: anterior, hash };
    anterior = hash;
    seq += 1;
    return encadenado;
  });
}

/**
 * Recalcula la cadena de una alerta.
 * @returns {{ valida, eventos, rotaEn: null | { indice, accion, en, motivo } , estadoCoherente }}
 *   motivo: sin_hash | secuencia | enlace_roto | hash_no_coincide
 */
export function verificarCadena(alerta) {
  const historial = alerta.historial ?? [];
  let anterior = hashGenesis(alerta);
  let rotaEn = null;

  for (const [indice, evento] of historial.entries()) {
    const romper = (motivo) => ({ indice, accion: evento.accion, en: evento.en ?? null, motivo });
    if (!evento.hash) { rotaEn = romper('sin_hash'); break; }
    if (evento.seq !== indice) { rotaEn = romper('secuencia'); break; }
    if (evento.hashAnterior !== anterior) { rotaEn = romper('enlace_roto'); break; }
    if (hashEvento(evento, indice, anterior) !== evento.hash) { rotaEn = romper('hash_no_coincide'); break; }
    anterior = evento.hash;
  }

  // el estado visible de la alerta debe ser el del último cambio de estado registrado
  const ultimoEstado = [...historial].reverse().find((e) => e.estado != null)?.estado ?? 'nueva';
  const estadoCoherente = (alerta.estado ?? 'nueva') === ultimoEstado;

  return {
    valida: !rotaEn && estadoCoherente,
    eventos: historial.length,
    ultimoHash: historial.at(-1)?.hash ?? null,
    rotaEn,
    estadoCoherente,
  };
}
