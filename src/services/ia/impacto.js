import mongoose from 'mongoose';
import ConversacionIA from '../../models/ConversacionIA.js';
import AlertaRiesgo from '../../models/AlertaRiesgo.js';
import Curso from '../../models/Curso.js';
import Tarea from '../../models/Tarea.js';
import Entrega from '../../models/Entrega.js';
import { MIN_FAMILIAS } from './cicloEdumon.js';
import { DIAS_RETENCION_CONVERSACIONES } from '../../config/edumonIA.js';

// Métricas de impacto de Edumon por institución y periodo. Solo agregados:
// nunca nombres, conversaciones ni ids de familias. Donde se desagrega por
// curso, un curso con menos de MIN_FAMILIAS familias se suma a "otros cursos".
//
// Plazos de atención de alertas (PENDIENTES DE VALIDACIÓN por convivencia):
// IA_PLAZO_ATENCION_HORAS_GRAVE (por defecto 24) e IA_PLAZO_ATENCION_HORAS_MODERADO (72).

const HORA = 60 * 60 * 1000;
const plazoHoras = (gravedad) => {
  const valor = Number(process.env[gravedad === 'grave' ? 'IA_PLAZO_ATENCION_HORAS_GRAVE' : 'IA_PLAZO_ATENCION_HORAS_MODERADO']);
  return valor > 0 ? valor : (gravedad === 'grave' ? 24 : 72);
};
// automática = caso grave; solicitada = la familia pidió ayuda en un caso moderado
const gravedadDe = (alerta) => (alerta.origen === 'solicitada' ? 'moderado' : 'grave');
const redondear = (x, d = 1) => (x == null ? null : Number(x.toFixed(d)));

// primer cambio de estado registrado en la bitácora (la primera atención)
const primeraAtencion = (alerta) => alerta.historial?.find((e) => e.accion === 'estado' && e.estado && e.estado !== 'nueva') ?? null;

export function metricasDeAlertas(alertas, ahora = new Date()) {
  const porAmbito = {};
  const porGravedad = { grave: 0, moderado: 0 };
  let dentro = 0;
  let fuera = 0;
  let enPlazo = 0;
  const tiempos = [];
  for (const a of alertas) {
    const ambito = a.rutaAtencion?.ambito ?? 'sin_clasificar';
    const gravedad = gravedadDe(a);
    porAmbito[ambito] ??= { total: 0, grave: 0, moderado: 0 };
    porAmbito[ambito].total += 1;
    porAmbito[ambito][gravedad] += 1;
    porGravedad[gravedad] += 1;

    const inicio = new Date(a.historial?.[0]?.en ?? a.createdAt).getTime();
    const limite = inicio + plazoHoras(gravedad) * HORA;
    const atencion = primeraAtencion(a);
    if (atencion) {
      const t = new Date(atencion.en).getTime();
      tiempos.push(t - inicio);
      if (t <= limite) dentro += 1; else fuera += 1;
    } else if (ahora.getTime() > limite) {
      fuera += 1;
    } else {
      enPlazo += 1; // sin atender, pero aún dentro del plazo: no cuenta todavía
    }
  }
  const evaluables = dentro + fuera;
  return {
    total: alertas.length,
    porAmbito,
    porGravedad,
    plazosHoras: { grave: plazoHoras('grave'), moderado: plazoHoras('moderado'), pendienteValidacion: true },
    atendidasDentroDelPlazo: dentro,
    fueraDelPlazo: fuera,
    sinAtenderAunEnPlazo: enPlazo,
    porcentajeDentroDelPlazo: evaluables ? redondear((dentro / evaluables) * 100) : null,
    horasPromedioHastaPrimeraAtencion: tiempos.length ? redondear(tiempos.reduce((s, t) => s + t, 0) / tiempos.length / HORA, 2) : null,
  };
}

export async function metricasDeImpacto({ institucionId, desde, hasta, ahora = new Date() }) {
  const inst = new mongoose.Types.ObjectId(String(institucionId));
  const fin = hasta ?? ahora;
  const inicio = desde ?? new Date(fin.getTime() - DIAS_RETENCION_CONVERSACIONES * 24 * HORA);
  const rango = { $gte: inicio, $lte: fin };

  const [uso] = await ConversacionIA.aggregate([
    { $match: { institucionId: inst } },
    { $unwind: '$mensajes' },
    { $match: { 'mensajes.rol': 'usuario', 'mensajes.creadoEn': rango } },
    { $group: { _id: null, familias: { $addToSet: '$usuarioId' }, conversaciones: { $addToSet: '$_id' }, mensajes: { $sum: 1 } } },
    { $project: { _id: 0, familias: { $size: '$familias' }, conversaciones: { $size: '$conversaciones' }, mensajes: 1 } },
  ]);

  const alertas = await AlertaRiesgo.find({ institucionId: inst, createdAt: rango })
    .select('origen rutaAtencion historial createdAt').lean();

  // participación en retos del ciclo (tareas de escuela de padres), por curso
  const cursos = await Curso.find({ institucionId: inst, estado: 'activo' }).select('nombre participantes').lean();
  const retos = await Tarea.find({ cursoId: { $in: cursos.map((c) => c._id) }, 'escuelaPadres.eje': { $exists: true, $ne: null }, createdAt: { $lte: fin } })
    .select('cursoId').lean();
  const entregas = retos.length
    ? await Entrega.find({ tareaId: { $in: retos.map((r) => r._id) }, estado: { $in: ['enviada', 'tarde'] }, fechaEntrega: rango }).select('tareaId padreId').lean()
    : [];
  const cursoDeReto = new Map(retos.map((r) => [String(r._id), String(r.cursoId)]));
  const porCurso = [];
  const otros = { cursos: 0, familias: 0, familiasQueParticiparon: 0, retos: 0, entregas: 0 };
  for (const c of cursos) {
    const familias = new Set(c.participantes.filter((p) => p.etiqueta === 'padre').map((p) => String(p.usuarioId)));
    const retosCurso = retos.filter((r) => String(r.cursoId) === String(c._id)).length;
    const entregasCurso = entregas.filter((e) => cursoDeReto.get(String(e.tareaId)) === String(c._id));
    const participaron = new Set(entregasCurso.map((e) => String(e.padreId)).filter((id) => familias.has(id))).size;
    const fila = { familias: familias.size, familiasQueParticiparon: participaron, retos: retosCurso, entregas: entregasCurso.length };
    if (familias.size >= MIN_FAMILIAS) {
      porCurso.push({ cursoId: c._id, nombre: c.nombre, ...fila, porcentajeParticipacion: familias.size ? redondear((participaron / familias.size) * 100) : null });
    } else {
      otros.cursos += 1;
      for (const k of ['familias', 'familiasQueParticiparon', 'retos', 'entregas']) otros[k] += fila[k];
    }
  }
  const totalFamilias = porCurso.reduce((s, c) => s + c.familias, 0) + otros.familias;
  const totalParticiparon = porCurso.reduce((s, c) => s + c.familiasQueParticiparon, 0) + otros.familiasQueParticiparon;

  return {
    periodo: { desde: inicio, hasta: fin, nota: `Las conversaciones se borran a los ${DIAS_RETENCION_CONVERSACIONES} días: el uso del chat solo cubre esa ventana.` },
    uso: { familiasQueUsaronEdumon: uso?.familias ?? 0, conversaciones: uso?.conversaciones ?? 0, mensajesDeFamilias: uso?.mensajes ?? 0 },
    alertas: metricasDeAlertas(alertas, ahora),
    retosDelCiclo: {
      minimoFamiliasPorCurso: MIN_FAMILIAS,
      retos: retos.length,
      entregas: entregas.length,
      porcentajeParticipacion: totalFamilias ? redondear((totalParticiparon / totalFamilias) * 100) : null,
      porCurso,
      otrosCursos: otros.cursos ? otros : null,
    },
  };
}
