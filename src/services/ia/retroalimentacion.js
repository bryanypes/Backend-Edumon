import RetroalimentacionIA from '../../models/RetroalimentacionIA.js';

// Los comentarios los escriben familias: antes de mostrarlos al colegio se
// ocultan correos, teléfonos y números largos (cédulas, documentos). No es una
// garantía completa (un nombre propio puede quedar): por eso el panel solo
// muestra comentarios recientes, sin quién los escribió.
export const anonimizarComentario = (texto = '') => texto
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]')
  .replace(/(\+?\d[\d\s-]{6,}\d)/g, '[número]')
  .trim();

const MAX_COMENTARIOS = 20;

/** Agregado de las calificaciones de una institución (solo conteos y comentarios anónimos). */
export async function resumenRetroalimentacion({ institucionId, sesionValidacion, desde, hasta }) {
  const filtro = { institucionId };
  if (sesionValidacion) filtro.sesionValidacion = sesionValidacion;
  if (desde || hasta) filtro.createdAt = { ...(desde && { $gte: desde }), ...(hasta && { $lte: hasta }) };

  const [filas, comentarios, sesiones] = await Promise.all([
    RetroalimentacionIA.aggregate([
      { $match: filtro },
      { $group: { _id: { tipo: '$tipoRespuesta', modo: '$modoIA' }, total: { $sum: 1 }, utiles: { $sum: { $cond: ['$util', 1, 0] } } } },
    ]),
    RetroalimentacionIA.find({ ...filtro, comentario: { $ne: '' } })
      .sort({ createdAt: -1 }).limit(MAX_COMENTARIOS)
      .select('util comentario tipoRespuesta modoIA sesionValidacion createdAt -_id').lean(),
    RetroalimentacionIA.distinct('sesionValidacion', { institucionId, sesionValidacion: { $ne: null } }),
  ]);

  const sumar = (clave) => {
    const grupos = {};
    for (const f of filas) {
      const k = f._id[clave] ?? 'sin_dato';
      grupos[k] ??= { total: 0, utiles: 0 };
      grupos[k].total += f.total;
      grupos[k].utiles += f.utiles;
    }
    return Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, { ...v, porcentajeUtil: Number(((v.utiles / v.total) * 100).toFixed(1)) }]));
  };
  const total = filas.reduce((s, f) => s + f.total, 0);
  const utiles = filas.reduce((s, f) => s + f.utiles, 0);

  return {
    filtro: { sesionValidacion: sesionValidacion ?? null, desde: desde ?? null, hasta: hasta ?? null },
    total,
    utiles,
    noUtiles: total - utiles,
    porcentajeUtil: total ? Number(((utiles / total) * 100).toFixed(1)) : null,
    porTipoRespuesta: sumar('tipo'),
    porModoIA: sumar('modo'),
    comentariosRecientes: comentarios.map((c) => ({
      util: c.util,
      comentario: anonimizarComentario(c.comentario),
      tipoRespuesta: c.tipoRespuesta,
      modoIA: c.modoIA,
      sesionValidacion: c.sesionValidacion,
      fecha: c.createdAt,
    })),
    sesionesValidacion: sesiones.sort(),
  };
}
