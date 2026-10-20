import LineamientoEscuelaPadres from '../../models/LineamientoEscuelaPadres.js';
import Curso from '../../models/Curso.js';
import Tarea from '../../models/Tarea.js';
import Evento from '../../models/Evento.js';
import Entrega from '../../models/Entrega.js';
import User from '../../models/User.js';
import AsistenciaEncuentro from '../../models/AsistenciaEncuentro.js';
import { completarJSON, iaDisponible } from './groqClient.js';
import { EJES_CRIANZA, EJES_LABELS } from '../../config/edumonIA.js';

// el comunicado se recorta para no pasarse del límite de tokens por minuto de Groq
const MAX_CARACTERES_COMUNICADO = 12000;

// ─── PDF ───────────────────────────────────────────────────────────────────────
/** Texto de un PDF (circular del Ministerio o la Secretaría). Lanza error si no se puede leer. */
export async function textoDePdf(buffer) {
  let unpdf;
  try {
    unpdf = await import('unpdf');
  } catch {
    const error = new Error('El servidor no tiene instalado el lector de PDF (paquete "unpdf"). Pega el texto del comunicado.');
    error.status = 501;
    throw error;
  }
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
  const { text } = await unpdf.extractText(pdf, { mergePages: true });
  return String(text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Redacción con Edumon ─────────────────────────────────────────────────────
const SYSTEM_LINEAMIENTOS = `Eres Edumon IA y ayudas al rector o coordinador de un colegio colombiano a organizar la escuela de padres. El colegio recibió un comunicado del Ministerio de Educación o de la Secretaría de Educación, y el directivo tiene sus propias indicaciones. Tu trabajo es convertir todo eso en lineamientos claros para que los docentes sepan cómo gestionar los retos de escuela de padres en cada grupo (curso = grado).

Marco legal que puedes citar: Ley 2025 de 2020 (escuelas de padres obligatorias, parte del PEI, mínimo 3 encuentros al año) y Decreto 459 de 2024 (5 ejes: garantía de derechos, educación de la sexualidad, crianza amorosa, estilos de vida saludables y apoyo en procesos educativos; caracterizar a las familias; usar TIC).

Reglas:
- Usa SOLO lo que dice el <comunicado>, las <indicaciones_del_directivo> y el marco legal. No inventes fechas, cifras, nombres de programas ni exigencias que no aparezcan.
- Si el directivo y el comunicado se contradicen, manda el comunicado oficial; anótalo en "pendientesPorDefinir".
- "resumenComunicado": qué pidió la entidad, en lenguaje sencillo, máximo 120 palabras. Si no hay comunicado, resume las indicaciones del directivo.
- "objetivo": una o dos frases.
- "ejesObligatorios": los ejes que el comunicado o el directivo exigen; si no dicen nada, los 5.
- "retosPorPeriodo": cuántos retos por periodo debe publicar cada grupo; si nadie lo dice, 1.
- "encuentrosPorAnio": lo que digan; si nadie lo dice, 3 (mínimo legal).
- "periodos": solo si el texto da fechas; formato AAAA-MM-DD; si no, lista vacía. Hoy es <fecha_hoy>.
- "formatoEntrega": cómo deben entregar las familias la evidencia (si nadie lo dice, una reflexión escrita corta).
- "indicacionesDocentes": 3 a 7 instrucciones concretas para los docentes, en imperativo y tuteando.
- "porCurso": para los grupos de <cursos> a los que el comunicado o el directivo les pida algo distinto, o donde convenga priorizar temas por la edad; usa el id exacto. Temas prioritarios cortos (máx. 8 palabras cada uno). Si no hay nada específico para un grupo, no lo incluyas.
- "pendientesPorDefinir": lo que falta decidir (fechas, responsables, formato) para que el directivo lo complete. Lista vacía si no falta nada.
- "mensajeDocentes": un mensaje cordial del directivo a sus docentes (máximo 120 palabras), explicando qué se pidió y qué se espera de ellos. Sin markdown.
- Español colombiano claro, sin tecnicismos.`;

const schemaLineamientos = (cursos) => ({
  type: 'object',
  additionalProperties: false,
  required: ['resumenComunicado', 'objetivo', 'ejesObligatorios', 'retosPorPeriodo', 'encuentrosPorAnio', 'periodos',
    'formatoEntrega', 'indicacionesDocentes', 'porCurso', 'pendientesPorDefinir', 'mensajeDocentes'],
  properties: {
    resumenComunicado: { type: 'string' },
    objetivo: { type: 'string' },
    ejesObligatorios: { type: 'array', items: { type: 'string', enum: EJES_CRIANZA } },
    retosPorPeriodo: { type: 'integer' },
    encuentrosPorAnio: { type: 'integer' },
    periodos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'inicio', 'fin'],
        properties: { nombre: { type: 'string' }, inicio: { type: 'string' }, fin: { type: 'string' } },
      },
    },
    formatoEntrega: { type: 'string' },
    indicacionesDocentes: { type: 'array', items: { type: 'string' } },
    porCurso: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cursoId', 'temasPrioritarios', 'indicaciones', 'retosPorPeriodo'],
        properties: {
          // sin cursos el enum no puede ir vacío: se usa un valor imposible
          cursoId: { type: 'string', enum: cursos.length ? cursos.map((c) => String(c._id)) : ['ninguno'] },
          temasPrioritarios: { type: 'array', items: { type: 'string' } },
          indicaciones: { type: 'string' },
          retosPorPeriodo: { type: ['integer', 'null'] },
        },
      },
    },
    pendientesPorDefinir: { type: 'array', items: { type: 'string' } },
    mensajeDocentes: { type: 'string' },
  },
});

const fechaValida = (texto) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto ?? '')) return null;
  const fecha = new Date(`${texto}T12:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const recortar = (texto, max) => String(texto ?? '').trim().slice(0, max);
const entre = (n, min, max, porDefecto) => (Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : porDefecto);

/** Deja el contenido dentro de los límites del modelo (venga de la IA o del formulario). */
export function sanearContenido(c = {}, cursosValidos = []) {
  const ids = new Set(cursosValidos.map((x) => String(x._id ?? x)));
  const ejes = [...new Set((c.ejesObligatorios ?? []).filter((e) => EJES_CRIANZA.includes(e)))];
  return {
    resumenComunicado: recortar(c.resumenComunicado, 3000),
    objetivo: recortar(c.objetivo, 800),
    ejesObligatorios: ejes,
    retosPorPeriodo: entre(Number(c.retosPorPeriodo), 0, 20, 1),
    encuentrosPorAnio: entre(Number(c.encuentrosPorAnio), 0, 50, 3),
    periodos: (c.periodos ?? []).slice(0, 8)
      .map((p) => ({
        nombre: recortar(p.nombre, 60) || 'Periodo',
        inicio: p.inicio instanceof Date ? p.inicio : fechaValida(String(p.inicio ?? '').slice(0, 10)),
        fin: p.fin instanceof Date ? p.fin : fechaValida(String(p.fin ?? '').slice(0, 10)),
      })),
    formatoEntrega: recortar(c.formatoEntrega, 800),
    indicacionesDocentes: (c.indicacionesDocentes ?? []).map((t) => recortar(t, 400)).filter(Boolean).slice(0, 10),
    porCurso: (c.porCurso ?? [])
      .filter((p) => ids.has(String(p.cursoId)))
      .map((p) => ({
        cursoId: p.cursoId,
        temasPrioritarios: (p.temasPrioritarios ?? []).map((t) => recortar(t, 150)).filter(Boolean).slice(0, 8),
        indicaciones: recortar(p.indicaciones, 800),
        retosPorPeriodo: p.retosPorPeriodo == null || p.retosPorPeriodo === '' ? null : entre(Number(p.retosPorPeriodo), 0, 20, null),
      })),
    pendientesPorDefinir: (c.pendientesPorDefinir ?? []).map((t) => recortar(t, 300)).filter(Boolean).slice(0, 10),
    mensajeDocentes: recortar(c.mensajeDocentes, 1500),
  };
}

// sin IA: lo mínimo legal y las indicaciones del directivo línea por línea
const plantilla = ({ texto, instrucciones }) => ({
  resumenComunicado: recortar(texto || instrucciones, 900),
  objetivo: 'Fortalecer el acompañamiento de las familias al proceso formativo de sus hijos, como lo exige la Ley 2025 de 2020.',
  ejesObligatorios: [...EJES_CRIANZA],
  retosPorPeriodo: 1,
  encuentrosPorAnio: 3,
  periodos: [],
  formatoEntrega: 'Una reflexión escrita corta de la familia sobre lo que hizo en casa.',
  indicacionesDocentes: String(instrucciones || '').split(/\n+/).map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 7),
  porCurso: [],
  pendientesPorDefinir: ['Edumon IA no estaba disponible: revisa y completa estos lineamientos a mano.'],
  mensajeDocentes: '',
});

/**
 * Redacta los lineamientos a partir del comunicado y las indicaciones del directivo.
 * Devuelve { contenido, generadoPor }.
 */
export async function redactarLineamientos({ texto = '', instrucciones = '', cursos = [] }) {
  if (!iaDisponible()) return { contenido: sanearContenido(plantilla({ texto, instrucciones }), cursos), generadoPor: 'plantilla' };

  const recortado = texto.length > MAX_CARACTERES_COMUNICADO;
  const contexto = [
    `<fecha_hoy>${new Date().toISOString().slice(0, 10)}</fecha_hoy>`,
    `<comunicado>${texto ? texto.slice(0, MAX_CARACTERES_COMUNICADO) : '(no hay comunicado: usa solo las indicaciones del directivo)'}${recortado ? '\n[…comunicado recortado por longitud]' : ''}</comunicado>`,
    `<indicaciones_del_directivo>${instrucciones || '(ninguna)'}</indicaciones_del_directivo>`,
    `<cursos>\n${cursos.map((c) => `- id ${c._id}: ${c.nombre}`).join('\n') || '(sin cursos)'}\n</cursos>`,
  ].join('\n');

  try {
    const r = await completarJSON({
      system: SYSTEM_LINEAMIENTOS,
      messages: [{ role: 'user', content: `${contexto}\n\nRedacta los lineamientos.` }],
      schema: schemaLineamientos(cursos),
      nombre: 'lineamientos_escuela_padres',
      esfuerzo: 'medium',
      maxTokens: 6000,
    });
    const contenido = sanearContenido(r, cursos);
    if (recortado) contenido.pendientesPorDefinir.push('El comunicado era muy largo y Edumon solo leyó la primera parte: revisa que no falte nada.');
    return { contenido, generadoPor: 'ia' };
  } catch (error) {
    console.error('[Edumon] Redacción de lineamientos falló, uso la plantilla:', error.message);
    return { contenido: sanearContenido(plantilla({ texto, instrucciones }), cursos), generadoPor: 'plantilla' };
  }
}

// ─── Seguimiento por grupo ────────────────────────────────────────────────────
// periodo vigente: el que contiene hoy; si no hay periodos, el año en curso
export function periodoVigente(periodos = [], hoy = new Date()) {
  const vigente = periodos.find((p) => p.inicio && p.fin && p.inicio <= hoy && hoy <= finDelDia(p.fin));
  if (vigente) return { nombre: vigente.nombre, inicio: vigente.inicio, fin: finDelDia(vigente.fin) };
  const anio = hoy.getFullYear();
  return { nombre: `Año ${anio}`, inicio: new Date(anio, 0, 1), fin: new Date(anio, 11, 31, 23, 59, 59) };
}

function finDelDia(fecha) {
  const f = new Date(fecha);
  f.setHours(23, 59, 59, 999);
  return f;
}

// un reto cuenta como de escuela de padres si tiene tema asignado o la etiqueta del asistente
const FILTRO_RETO_ESCUELA = { $or: [{ escuelaPadres: { $ne: null } }, { etiquetas: 'escuela-de-padres' }] };

// un borrador no es participación: solo cuentan las entregas enviadas (a tiempo o tarde)
const ENTREGADA = ['enviada', 'tarde'];

const enRango = (fecha, { inicio, fin }) => fecha >= inicio && fecha <= fin;

/**
 * Datos de participación de varios cursos: retos de escuela de padres (año),
 * entregas de esos retos, encuentros de escuela de padres del año y asistencia
 * marcada. Una familia "participó" en el periodo si entregó un reto del periodo
 * o asistió a un encuentro del periodo.
 */
async function datosParticipacion(cursos, periodo) {
  const anio = new Date().getFullYear();
  const delAnio = { inicio: new Date(Math.min(periodo.inicio.getTime(), new Date(anio, 0, 1).getTime())), fin: new Date(anio, 11, 31, 23, 59, 59) };
  const idsCursos = cursos.map((c) => c._id);

  const [retos, encuentros] = await Promise.all([
    Tarea.find({ cursoId: { $in: idsCursos }, ...FILTRO_RETO_ESCUELA, createdAt: { $gte: delAnio.inicio } })
      .select('cursoId titulo escuelaPadres createdAt fechaEntrega').sort({ createdAt: -1 }).lean(),
    Evento.find({
      categoria: 'escuela_padres', cursosIds: { $in: idsCursos }, estado: { $ne: 'cancelado' },
      fechaInicio: { $gte: delAnio.inicio, $lte: delAnio.fin },
    }).select('titulo fechaInicio cursosIds').sort({ fechaInicio: 1 }).lean(),
  ]);
  const retosPeriodo = retos.filter((r) => enRango(r.createdAt, periodo));
  const [entregas, asistencias] = await Promise.all([
    Entrega.find({ tareaId: { $in: retosPeriodo.map((r) => r._id) }, estado: { $in: ENTREGADA } }).select('tareaId padreId fechaEntrega').lean(),
    AsistenciaEncuentro.find({ eventoId: { $in: encuentros.map((e) => e._id) } }).select('eventoId usuarioId asistio modalidad').lean(),
  ]);

  const ahora = new Date();
  const porCurso = new Map(cursos.map((curso) => {
    const id = String(curso._id);
    const familias = (curso.participantes ?? []).filter((p) => p.etiqueta === 'padre').map((p) => String(p.usuarioId));
    const setFamilias = new Set(familias);
    const delCurso = retos.filter((r) => String(r.cursoId) === id);
    const retosDelPeriodo = delCurso.filter((r) => enRango(r.createdAt, periodo));
    const idsRetos = new Set(retosDelPeriodo.map((r) => String(r._id)));
    const encuentrosCurso = encuentros.filter((e) => e.cursosIds.some((c) => String(c) === id));
    const encuentrosPeriodo = encuentrosCurso.filter((e) => enRango(e.fechaInicio, periodo));
    const idsEncuentrosPeriodo = new Set(encuentrosPeriodo.map((e) => String(e._id)));

    // familia → retos que entregó / encuentros a los que asistió (del periodo)
    const entrego = new Map();
    for (const e of entregas) {
      const f = String(e.padreId);
      if (setFamilias.has(f) && idsRetos.has(String(e.tareaId))) entrego.set(f, [...(entrego.get(f) ?? []), String(e.tareaId)]);
    }
    const asistio = new Map();
    for (const a of asistencias) {
      const f = String(a.usuarioId);
      if (a.asistio && setFamilias.has(f) && idsEncuentrosPeriodo.has(String(a.eventoId))) asistio.set(f, [...(asistio.get(f) ?? []), String(a.eventoId)]);
    }
    // encuentros ya realizados sin ninguna asistencia marcada para este grupo
    const marcados = new Set(asistencias.filter((a) => setFamilias.has(String(a.usuarioId))).map((a) => String(a.eventoId)));
    const realizados = encuentrosCurso.filter((e) => e.fechaInicio <= ahora);

    return [id, {
      familias, delCurso, retosDelPeriodo, encuentrosCurso, encuentrosPeriodo, entrego, asistio,
      realizados, sinMarcar: realizados.filter((e) => !marcados.has(String(e._id))),
    }];
  }));
  return porCurso;
}

/**
 * Por cada curso activo: retos de escuela de padres en el periodo vigente frente
 * a la meta, ejes obligatorios que el grupo aún no trabajó este año, familias que
 * participaron (entregaron un reto o asistieron a un encuentro) y encuentros del
 * año frente a la meta. `soloCursos` limita el resultado (el docente solo ve los suyos).
 */
export async function seguimientoPorCurso(institucionId, contenido, { soloCursos = null } = {}) {
  const filtroCursos = { institucionId, estado: 'activo', ...(soloCursos && { _id: { $in: soloCursos } }) };
  const cursos = await Curso.find(filtroCursos).select('nombre docenteId participantes').populate('docenteId', 'nombre apellido').lean();
  const periodo = periodoVigente(contenido?.periodos ?? []);
  const datos = await datosParticipacion(cursos, periodo);
  const obligatorios = contenido?.ejesObligatorios?.length ? contenido.ejesObligatorios : [];
  const metaEncuentros = contenido?.encuentrosPorAnio ?? 3;

  return {
    periodo,
    cursos: cursos.map((curso) => {
      const d = datos.get(String(curso._id));
      const especifico = contenido?.porCurso?.find((p) => String(p.cursoId) === String(curso._id));
      const meta = especifico?.retosPorPeriodo ?? contenido?.retosPorPeriodo ?? 1;
      const ejesCubiertos = [...new Set(d.delCurso.map((r) => r.escuelaPadres?.eje).filter(Boolean))];
      const participaron = new Set([...d.entrego.keys(), ...d.asistio.keys()]);
      const publicados = d.retosDelPeriodo.length;
      return {
        cursoId: curso._id,
        nombre: curso.nombre,
        docente: curso.docenteId ? `${curso.docenteId.nombre} ${curso.docenteId.apellido ?? ''}`.trim() : null,
        meta,
        publicados,
        estado: publicados >= meta ? 'al_dia' : publicados > 0 ? 'en_progreso' : 'sin_retos',
        ejesCubiertos,
        ejesFaltantes: obligatorios.filter((e) => !ejesCubiertos.includes(e)),
        ultimoReto: d.delCurso[0] ? { titulo: d.delCurso[0].titulo, creadoEn: d.delCurso[0].createdAt } : null,
        participacion: {
          familias: d.familias.length,
          entregaron: d.entrego.size,
          asistieron: d.asistio.size,
          participaron: participaron.size,
          porcentaje: d.familias.length ? Math.round((participaron.size / d.familias.length) * 100) : 0,
        },
        encuentros: {
          meta: metaEncuentros,
          realizados: d.realizados.length,
          programados: d.encuentrosCurso.length - d.realizados.length,
          sinAsistenciaMarcada: d.sinMarcar.length,
        },
      };
    }),
  };
}

/**
 * Trazabilidad nominal de un grupo: qué retos entregó y a qué encuentros asistió
 * cada familia en el periodo vigente. Es la base del reporte de participación.
 */
export async function detalleParticipacionCurso(curso, contenido) {
  const periodo = periodoVigente(contenido?.periodos ?? []);
  const d = (await datosParticipacion([curso], periodo)).get(String(curso._id));
  const usuarios = await User.find({ _id: { $in: d.familias } }).select('nombre apellido telefono correo').lean();
  const entregaPorFamiliaReto = new Map();
  const entregas = await Entrega.find({ tareaId: { $in: d.retosDelPeriodo.map((r) => r._id) }, padreId: { $in: d.familias }, estado: { $in: ENTREGADA } })
    .select('tareaId padreId fechaEntrega').lean();
  for (const e of entregas) entregaPorFamiliaReto.set(`${e.padreId}:${e.tareaId}`, e.fechaEntrega);
  const marcas = await AsistenciaEncuentro.find({ eventoId: { $in: d.encuentrosCurso.map((e) => e._id) }, usuarioId: { $in: d.familias } })
    .select('eventoId usuarioId asistio modalidad').lean();
  const marcaPorFamiliaEncuentro = new Map(marcas.map((m) => [`${m.usuarioId}:${m.eventoId}`, m]));
  const ahora = new Date();

  return {
    curso: { _id: curso._id, nombre: curso.nombre },
    periodo,
    retos: d.retosDelPeriodo.map((r) => ({ _id: r._id, titulo: r.titulo, creadoEn: r.createdAt, fechaEntrega: r.fechaEntrega })),
    encuentros: d.encuentrosCurso.map((e) => ({
      _id: e._id, titulo: e.titulo, fechaInicio: e.fechaInicio,
      enPeriodo: enRango(e.fechaInicio, periodo), realizado: e.fechaInicio <= ahora,
      asistenciaMarcada: !d.sinMarcar.some((s) => String(s._id) === String(e._id)) && e.fechaInicio <= ahora,
    })),
    familias: usuarios
      .map((u) => {
        const id = String(u._id);
        return {
          usuarioId: u._id,
          nombre: `${u.nombre} ${u.apellido ?? ''}`.trim(),
          telefono: u.telefono ?? null,
          retos: d.retosDelPeriodo.map((r) => ({ tareaId: r._id, entregadoEn: entregaPorFamiliaReto.get(`${id}:${r._id}`) ?? null })),
          encuentros: d.encuentrosCurso.map((e) => {
            const m = marcaPorFamiliaEncuentro.get(`${id}:${e._id}`);
            return { eventoId: e._id, asistio: m ? m.asistio : null, modalidad: m?.modalidad ?? null };
          }),
          participo: d.entrego.has(id) || d.asistio.has(id),
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

// ─── Contexto para el asistente de retos ──────────────────────────────────────
/**
 * Lo que el asistente de retos debe respetar para un curso: los lineamientos
 * publicados de su institución y los ejes obligatorios que ese grupo aún no
 * trabajó. null si el colegio no ha publicado lineamientos.
 */
export async function contextoLineamientosDelCurso(curso) {
  if (!curso?.institucionId) return null;
  const lineamiento = await LineamientoEscuelaPadres.findOne({ institucionId: curso.institucionId, publicado: { $ne: null } })
    .select('publicado version publicadoEn').lean();
  if (!lineamiento?.publicado) return null;

  const l = lineamiento.publicado;
  const especifico = l.porCurso?.find((p) => String(p.cursoId) === String(curso._id));
  const { cursos } = await seguimientoPorCurso(curso.institucionId, l, { soloCursos: [curso._id] });
  const faltantes = cursos[0]?.ejesFaltantes ?? [];

  const lineas = [
    l.objetivo && `Objetivo del colegio: ${l.objetivo}`,
    l.formatoEntrega && `Formato de entrega que pide el colegio: ${l.formatoEntrega}`,
    l.indicacionesDocentes?.length && `Indicaciones para los docentes: ${l.indicacionesDocentes.join(' / ')}`,
    especifico?.temasPrioritarios?.length && `Temas prioritarios para este grupo: ${especifico.temasPrioritarios.join(', ')}`,
    especifico?.indicaciones && `Indicaciones para este grupo: ${especifico.indicaciones}`,
    faltantes.length && `Ejes obligatorios que este grupo aún no ha trabajado este año: ${faltantes.map((e) => EJES_LABELS[e]).join(', ')}`,
  ].filter(Boolean);

  return {
    texto: lineas.join('\n'),
    version: lineamiento.version,
    publicadoEn: lineamiento.publicadoEn,
    temasPrioritarios: especifico?.temasPrioritarios ?? [],
    ejesFaltantes: faltantes,
  };
}
