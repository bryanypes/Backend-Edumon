import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import UsoIA from '../../models/UsoIA.js';

// Costo de la IA con los tokens reales de cada llamada (UsoIA) y la tabla de
// precios oficial (src/config/preciosIA.json, o IA_PRECIOS_ARCHIVO). Si un
// modelo no está en la tabla, su costo queda null: nunca se inventa un precio.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUTA_PRECIOS = () => process.env.IA_PRECIOS_ARCHIVO || path.resolve(AQUI, '../../config/preciosIA.json');
export const cargarPrecios = () => JSON.parse(fs.readFileSync(RUTA_PRECIOS(), 'utf8'));

const redondear = (x, d = 6) => (x == null ? null : Number(x.toFixed(d)));
const costoDe = (precio, entrada, salida, segundosAudio = 0) => {
  if (precio?.audioUSDPorHora != null) return (segundosAudio / 3600) * precio.audioUSDPorHora;
  if (precio?.entradaUSDPorMillon == null) return null;
  return (entrada * precio.entradaUSDPorMillon + salida * precio.salidaUSDPorMillon) / 1e6;
};

/**
 * @param {{ desde?: Date, hasta?: Date, familias: number, mensajesPorFamiliaMes: number }} p
 */
export async function resumenCostos({ desde, hasta, familias, mensajesPorFamiliaMes }) {
  const tabla = cargarPrecios();
  const precio = (proveedor, modelo) => tabla.modelos.find((m) => m.proveedor === proveedor && m.modelo === modelo) ?? null;
  const filtro = (desde || hasta) ? { en: { ...(desde && { $gte: desde }), ...(hasta && { $lte: hasta }) } } : {};

  const filas = await UsoIA.aggregate([
    { $match: filtro },
    { $group: { _id: { proveedor: '$proveedor', modelo: '$modelo', operacion: '$operacion' }, llamadas: { $sum: 1 }, tokensEntrada: { $sum: '$tokensEntrada' }, tokensSalida: { $sum: '$tokensSalida' }, segundosAudio: { $sum: '$segundosAudio' } } },
  ]);

  let costoTotal = 0;
  let sinPrecio = false;
  const porModelo = {};
  let costoChat = 0;
  let mensajesChat = 0;
  for (const f of filas) {
    const { proveedor, modelo, operacion } = f._id;
    const p = precio(proveedor, modelo);
    const costo = costoDe(p, f.tokensEntrada, f.tokensSalida, f.segundosAudio ?? 0);
    if (costo == null) sinPrecio = true; else costoTotal += costo;
    const clave = `${proveedor}/${modelo}`;
    porModelo[clave] ??= { llamadas: 0, tokensEntrada: 0, tokensSalida: 0, segundosAudio: 0, costoUSD: 0, precio: p };
    porModelo[clave].segundosAudio += f.segundosAudio ?? 0;
    porModelo[clave].llamadas += f.llamadas;
    porModelo[clave].tokensEntrada += f.tokensEntrada;
    porModelo[clave].tokensSalida += f.tokensSalida;
    porModelo[clave].costoUSD = costo == null || porModelo[clave].costoUSD == null ? null : porModelo[clave].costoUSD + costo;
    // un mensaje del chat = una clasificación (más, si aplica, su respuesta redactada)
    if (operacion === 'clasificacion_edumon') mensajesChat += f.llamadas;
    if (['clasificacion_edumon', 'respuesta_edumon'].includes(operacion) && costo != null) costoChat += costo;
  }

  const costoPorMensaje = mensajesChat ? costoChat / mensajesChat : null;
  const mensajesMes = familias * mensajesPorFamiliaMes;
  return {
    periodo: { desde: desde ?? null, hasta: hasta ?? null },
    tablaDePrecios: { nota: tabla.nota, modelos: tabla.modelos },
    llamadas: filas.reduce((s, f) => s + f.llamadas, 0),
    tokensEntrada: filas.reduce((s, f) => s + f.tokensEntrada, 0),
    tokensSalida: filas.reduce((s, f) => s + f.tokensSalida, 0),
    costoAcumuladoUSD: redondear(costoTotal),
    hayModelosSinPrecio: sinPrecio,
    porModelo: Object.fromEntries(Object.entries(porModelo).map(([k, v]) => [k, { ...v, costoUSD: redondear(v.costoUSD) }])),
    chat: { mensajes: mensajesChat, costoPorMensajeUSD: redondear(costoPorMensaje, 8) },
    proyeccionMensual: {
      familias,
      mensajesPorFamiliaMes,
      mensajesMes,
      costoUSD: costoPorMensaje == null ? null : redondear(costoPorMensaje * mensajesMes, 4),
      supuesto: 'Costo por mensaje medido × mensajes por familia al mes × familias. Ajustar mensajesPorFamiliaMes con el uso real.',
    },
    alcance: 'Plataforma completa: los tokens se registran por llamada, sin institución.',
  };
}
