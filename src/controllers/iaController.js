import mongoose from 'mongoose';
import ConsentimientoIA from '../models/ConsentimientoIA.js';
import ConversacionIA from '../models/ConversacionIA.js';
import AlertaRiesgo from '../models/AlertaRiesgo.js';
import Institucion from '../models/Institucion.js';
import User from '../models/User.js';
import {
  VERSION_CONSENTIMIENTO, EJES_CRIANZA, EJES_LABELS, SUBTEMAS, SUBTEMAS_POR_EJE,
} from '../config/edumonIA.js';
import { procesarMensaje, solicitarAyuda, institucionDeLaConversacion } from '../services/ia/edumonService.js';
import { generarRetoEscuelaPadres } from '../services/ia/retoEscuelaPadres.js';
import { sugerirModulos } from '../services/ia/sugerenciasModulos.js';
import { contextoLineamientosDelCurso } from '../services/ia/lineamientos.js';
import Curso from '../models/Curso.js';
import Modulo from '../models/Modulo.js';
import { estadoProveedores } from '../services/ia/proveedorIA.js';
import { encadenar, verificarCadena } from '../services/ia/bitacora.js';
import { explicarMensaje, explicarAlerta } from '../services/ia/explicacion.js';
import { vistaCiclo, sugerenciaCiclo, MIN_FAMILIAS } from '../services/ia/cicloEdumon.js';
import { resumenMetricas } from '../services/ia/metricasIA.js';
import RetroalimentacionIA from '../models/RetroalimentacionIA.js';
import { resumenRetroalimentacion } from '../services/ia/retroalimentacion.js';
import { metricasDeImpacto } from '../services/ia/impacto.js';
import { resumenCostos } from '../services/ia/costosIA.js';

const MAX_CARACTERES_MENSAJE = 2000;

const errorInterno = (res, error) => res.status(500).json({
  message: 'Error interno',
  error: process.env.NODE_ENV === 'development' ? error.message : undefined,
});

// filtro de dueño: el titular (perfilId null) y cada perfil familiar tienen
// sus propias conversaciones y su propio consentimiento
const filtroDueño = (req) => ({
  usuarioId: req.user.userId,
  perfilId: req.user.perfilId || null,
});

// ─── Consentimiento ───────────────────────────────────────────────────────────

export const getConsentimiento = async (req, res) => {
  try {
    const vigente = await ConsentimientoIA.obtenerVigente(
      req.user.userId,
      req.user.perfilId,
      VERSION_CONSENTIMIENTO,
    ).lean();

    res.json({
      versionVigente: VERSION_CONSENTIMIENTO,
      aceptado: Boolean(vigente),
      aceptadoEn: vigente?.aceptadoEn ?? null,
    });
  } catch (error) {
    errorInterno(res, error);
  }
};

export const aceptarConsentimiento = async (req, res) => {
  try {
    const { version } = req.body;

    // el cliente manda la versión que mostró: si el texto cambió mientras el
    // padre lo leía, no puede quedar registrado que aceptó la versión nueva
    if (version !== VERSION_CONSENTIMIENTO) {
      return res.status(409).json({
        message: 'El consentimiento cambió. Vuelve a leerlo antes de aceptarlo.',
        versionVigente: VERSION_CONSENTIMIENTO,
      });
    }

    const existente = await ConsentimientoIA.obtenerVigente(
      req.user.userId,
      req.user.perfilId,
      VERSION_CONSENTIMIENTO,
    ).lean();
    if (existente) {
      return res.json({ message: 'El consentimiento ya estaba aceptado', aceptadoEn: existente.aceptadoEn });
    }

    const consentimiento = await ConsentimientoIA.create({
      ...filtroDueño(req),
      version: VERSION_CONSENTIMIENTO,
    });

    res.status(201).json({ message: 'Consentimiento aceptado', aceptadoEn: consentimiento.aceptadoEn });
  } catch (error) {
    errorInterno(res, error);
  }
};

// revocar también borra las conversaciones: es lo que promete el consentimiento
export const revocarConsentimiento = async (req, res) => {
  try {
    const { modifiedCount } = await ConsentimientoIA.updateMany(
      { ...filtroDueño(req), revocadoEn: null },
      { revocadoEn: new Date() },
    );
    const { deletedCount } = await ConversacionIA.deleteMany(filtroDueño(req));

    res.json({
      message: modifiedCount ? 'Consentimiento revocado y conversaciones eliminadas' : 'No había un consentimiento activo',
      conversacionesEliminadas: deletedCount,
    });
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Conversaciones ───────────────────────────────────────────────────────────

export const getMisConversaciones = async (req, res) => {
  try {
    const conversaciones = await ConversacionIA.find(filtroDueño(req))
      .select('titulo edadHijo ultimaActividad createdAt')
      .sort({ ultimaActividad: -1 })
      .lean();

    res.json({ conversaciones });
  } catch (error) {
    errorInterno(res, error);
  }
};

export const eliminarConversacion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de conversación inválido' });
    }

    // 404 tanto si no existe como si es de otro: no revelar que existe
    const { deletedCount } = await ConversacionIA.deleteOne({ _id: id, ...filtroDueño(req) });
    if (!deletedCount) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    res.json({ message: 'Conversación eliminada' });
  } catch (error) {
    errorInterno(res, error);
  }
};

export const crearConversacion = async (req, res) => {
  try {
    const usuario = await User.findById(req.user.userId).select('institucionId').lean();
    const conversacion = await ConversacionIA.create({
      ...filtroDueño(req),
      institucionId: await institucionDeLaConversacion(req.user.userId, usuario?.institucionId),
    });

    res.status(201).json({ conversacion });
  } catch (error) {
    errorInterno(res, error);
  }
};

export const getConversacion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de conversación inválido' });
    }

    const conversacion = await ConversacionIA.findOne({ _id: id, ...filtroDueño(req) }).lean();
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    res.json({ conversacion });
  } catch (error) {
    errorInterno(res, error);
  }
};

export const enviarMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const contenido = typeof req.body.contenido === 'string' ? req.body.contenido.trim() : '';

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de conversación inválido' });
    }
    if (!contenido || contenido.length > MAX_CARACTERES_MENSAJE) {
      return res.status(400).json({ message: `El mensaje debe tener entre 1 y ${MAX_CARACTERES_MENSAJE} caracteres` });
    }

    const conversacion = await ConversacionIA.findOne({ _id: id, ...filtroDueño(req) });
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    const respuesta = await procesarMensaje(conversacion, contenido);

    res.status(201).json({
      mensajeUsuario: conversacion.mensajes[conversacion.mensajes.length - 2],
      respuesta,
      conversacion: {
        _id: conversacion._id,
        titulo: conversacion.titulo,
        edadHijo: conversacion.edadHijo,
      },
    });
  } catch (error) {
    errorInterno(res, error);
  }
};

// nivel 2: la familia acepta que orientación y su docente la contacten
export const pedirAyuda = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de conversación inválido' });
    }
    const conversacion = await ConversacionIA.findOne({ _id: id, ...filtroDueño(req) });
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    const mensaje = await solicitarAyuda(conversacion);
    if (!mensaje) {
      return res.status(409).json({ message: 'No hay una solicitud de ayuda pendiente en esta conversación' });
    }
    res.status(201).json({ mensaje });
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Alertas de riesgo (admin, responsable de convivencia, docente del curso) ─

// filtro de las alertas que el usuario puede ver y gestionar, o null si ninguna:
// el admin y el responsable de convivencia, todas las de la institución; cualquier
// otro docente, solo las de familias de sus cursos
const filtroAlertasVisibles = async (req) => {
  if (!req.user.institucionId) return null;
  const institucionId = req.user.institucionId;
  if (req.user.rol === 'administrador') return { institucionId };

  const esResponsable = await Institucion.exists({
    _id: institucionId,
    responsableConvivenciaId: req.user.userId,
  });
  return esResponsable ? { institucionId } : { institucionId, docentesCurso: req.user.userId };
};

const SIN_INSTITUCION = 'No tienes una institución asignada';

export const getAlertas = async (req, res) => {
  try {
    const visibles = await filtroAlertasVisibles(req);
    if (!visibles) return res.status(403).json({ message: SIN_INSTITUCION });

    const filtro = { ...visibles };
    if (['nueva', 'en_atencion', 'cerrada'].includes(req.query.estado)) filtro.estado = req.query.estado;

    const alertas = await AlertaRiesgo.find(filtro)
      .populate('usuarioId', 'nombre apellido telefono correo')
      .populate('perfilId', 'nombre')
      .populate('atendidaPor', 'nombre apellido')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ alertas });
  } catch (error) {
    errorInterno(res, error);
  }
};

export const getAlerta = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de alerta inválido' });
    }

    const visibles = await filtroAlertasVisibles(req);
    if (!visibles) return res.status(403).json({ message: SIN_INSTITUCION });

    // 404 también si no le corresponde verla: no revelar que existe
    const alerta = await AlertaRiesgo.findOne({ _id: id, ...visibles })
      .populate('usuarioId', 'nombre apellido telefono correo')
      .populate('perfilId', 'nombre')
      .populate('atendidaPor', 'nombre apellido')
      .populate('historial.por', 'nombre apellido rol')
      .lean();
    if (!alerta) {
      return res.status(404).json({ message: 'Alerta no encontrada' });
    }

    res.json({ alerta });
  } catch (error) {
    errorInterno(res, error);
  }
};

export const actualizarAlerta = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, notas } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de alerta inválido' });
    }
    if (estado !== undefined && !['nueva', 'en_atencion', 'cerrada'].includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }
    if (notas !== undefined && (typeof notas !== 'string' || notas.length > 2000)) {
      return res.status(400).json({ message: 'Las notas deben ser texto de máximo 2000 caracteres' });
    }

    const visibles = await filtroAlertasVisibles(req);
    if (!visibles) return res.status(403).json({ message: SIN_INSTITUCION });

    const actual = await AlertaRiesgo.findOne({ _id: id, ...visibles })
      .select('estado notas atendidaEn institucionId usuarioId categoria origen mensajeDisparador historial').lean();
    if (!actual) {
      return res.status(404).json({ message: 'Alerta no encontrada' });
    }

    // cada cambio real queda en el historial (quién, cuándo, qué); nada se reescribe
    const ahora = new Date();
    const set = {};
    const entradas = [];
    const notaNueva = notas?.trim();
    const cambiaEstado = estado !== undefined && estado !== actual.estado;
    const cambiaNota = notas !== undefined && notaNueva !== (actual.notas ?? '');

    if (cambiaNota) set.notas = notaNueva;
    if (cambiaEstado) {
      set.estado = estado;
      if (estado !== 'nueva') set.atendidaPor = req.user.userId;
      if (estado !== 'nueva' && !actual.atendidaEn) set.atendidaEn = ahora;
      set.cerradaEn = estado === 'cerrada' ? ahora : null;
      entradas.push({ accion: 'estado', estado, nota: cambiaNota ? notaNueva : '', por: req.user.userId, en: ahora });
    } else if (cambiaNota && notaNueva) {
      entradas.push({ accion: 'nota', nota: notaNueva, por: req.user.userId, en: ahora });
    }

    // cada evento nuevo se encadena con SHA-256 al último; si otro cambio entró
    // entre la lectura y la escritura, el filtro por longitud no coincide (409)
    const encadenadas = encadenar(actual, actual.historial ?? [], entradas);
    const largo = (actual.historial ?? []).length;
    const actualizacion = { ...(Object.keys(set).length && { $set: set }), ...(encadenadas.length && { $push: { historial: { $each: encadenadas } } }) };
    const filtroEscritura = { _id: id, ...visibles, ...(encadenadas.length && { [`historial.${largo}`]: { $exists: false } }) };
    const alerta = await AlertaRiesgo.findOneAndUpdate(filtroEscritura, actualizacion, { new: true })
      .populate('usuarioId', 'nombre apellido telefono correo')
      .populate('perfilId', 'nombre')
      .populate('atendidaPor', 'nombre apellido')
      .populate('historial.por', 'nombre apellido rol')
      .lean();
    if (!alerta && encadenadas.length) {
      return res.status(409).json({ message: 'La alerta cambió mientras la editabas. Vuelve a cargarla e inténtalo de nuevo.', code: 'ALERTA_MODIFICADA' });
    }
    if (!alerta) {
      return res.status(404).json({ message: 'Alerta no encontrada' });
    }

    res.json({ message: 'Alerta actualizada', alerta });
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── "¿Por qué Edumon dijo esto?" ─────────────────────────────────────────────
// la familia, sobre sus propios mensajes (la conversación es privada)
export const getExplicacionMensaje = async (req, res) => {
  try {
    const { id, mensajeId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(mensajeId)) {
      return res.status(400).json({ message: 'ID de conversación o de mensaje inválido' });
    }
    const conversacion = await ConversacionIA.findOne({ _id: id, ...filtroDueño(req) }).lean();
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }
    const explicacion = await explicarMensaje(conversacion, mensajeId);
    if (!explicacion) {
      return res.status(404).json({ message: 'Mensaje no encontrado en esta conversación' });
    }
    res.json({ explicacion });
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Retroalimentación: la familia califica una respuesta de Edumon ───────────
export const calificarRespuesta = async (req, res) => {
  try {
    const { id, mensajeId } = req.params;
    const { util } = req.body;
    const comentario = typeof req.body.comentario === 'string' ? req.body.comentario.trim() : '';
    const sesion = typeof req.body.sesionValidacion === 'string' ? req.body.sesionValidacion.trim() : '';
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(mensajeId)) {
      return res.status(400).json({ message: 'ID de conversación o de mensaje inválido' });
    }
    if (typeof util !== 'boolean') {
      return res.status(400).json({ message: 'Indica si la respuesta fue útil (util: true o false)' });
    }
    if (comentario.length > 500 || sesion.length > 60) {
      return res.status(400).json({ message: 'El comentario admite 500 caracteres y la sesión 60' });
    }
    const conversacion = await ConversacionIA.findOne({ _id: id, ...filtroDueño(req) }).select('institucionId mensajes').lean();
    if (!conversacion) return res.status(404).json({ message: 'Conversación no encontrada' });
    const mensaje = conversacion.mensajes.find((m) => String(m._id) === mensajeId);
    if (!mensaje) return res.status(404).json({ message: 'Mensaje no encontrado en esta conversación' });
    if (mensaje.rol !== 'edumon') return res.status(400).json({ message: 'Solo se califican las respuestas de Edumon' });

    const clave = { mensajeId, usuarioId: req.user.userId, perfilId: req.user.perfilId || null };
    const existia = await RetroalimentacionIA.exists(clave);
    const calificacion = await RetroalimentacionIA.findOneAndUpdate(clave, {
      $set: {
        conversacionId: id,
        institucionId: conversacion.institucionId,
        util,
        comentario,
        sesionValidacion: sesion || null,
        tipoRespuesta: mensaje.tipo ?? null,
        modoIA: mensaje.ia?.modo ?? null,
      },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).select('util comentario sesionValidacion updatedAt').lean();

    res.status(existia ? 200 : 201).json({ message: existia ? 'Calificación actualizada' : 'Gracias por tu calificación', calificacion });
  } catch (error) {
    errorInterno(res, error);
  }
};

// agregado para el administrador: totales, % útil y comentarios recientes anónimos
export const getRetroalimentacion = async (req, res) => {
  try {
    if (!req.user.institucionId) return res.status(403).json({ message: SIN_INSTITUCION });
    const fecha = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);
    const sesion = typeof req.query.sesion === 'string' && req.query.sesion.trim() ? req.query.sesion.trim() : undefined;
    res.json(await resumenRetroalimentacion({
      institucionId: new mongoose.Types.ObjectId(req.user.institucionId),
      sesionValidacion: sesion,
      desde: fecha(req.query.desde),
      hasta: fecha(req.query.hasta),
    }));
  } catch (error) {
    errorInterno(res, error);
  }
};

// métricas de impacto de la institución del administrador (solo agregados)
export const getImpacto = async (req, res) => {
  try {
    if (!req.user.institucionId) return res.status(403).json({ message: SIN_INSTITUCION });
    const fecha = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);
    const desde = fecha(req.query.desde);
    const hasta = fecha(req.query.hasta);
    if ((req.query.desde && !desde) || (req.query.hasta && !hasta) || (desde && hasta && desde > hasta)) {
      return res.status(400).json({ message: 'Periodo inválido: usa fechas ISO y desde <= hasta' });
    }
    res.json(await metricasDeImpacto({ institucionId: req.user.institucionId, desde, hasta }));
  } catch (error) {
    errorInterno(res, error);
  }
};

// costo de la IA: acumulado, por mensaje y proyección mensual para el colegio
export const getCostosIA = async (req, res) => {
  try {
    if (!req.user.institucionId) return res.status(403).json({ message: SIN_INSTITUCION });
    const fecha = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);
    const entero = (v, def) => (v === undefined ? def : (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : NaN));
    // por defecto, las familias de los cursos activos de la institución
    const familiasInstitucion = (await Curso.distinct('participantes.usuarioId', {
      institucionId: req.user.institucionId, estado: 'activo', 'participantes.etiqueta': 'padre',
    })).length;
    const familias = entero(req.query.familias, familiasInstitucion);
    const mensajesPorFamiliaMes = entero(req.query.mensajesPorFamiliaMes, 10);
    if (Number.isNaN(familias) || Number.isNaN(mensajesPorFamiliaMes)) {
      return res.status(400).json({ message: 'familias y mensajesPorFamiliaMes deben ser enteros >= 0' });
    }
    res.json(await resumenCostos({ desde: fecha(req.query.desde), hasta: fecha(req.query.hasta), familias, mensajesPorFamiliaMes }));
  } catch (error) {
    errorInterno(res, error);
  }
};

// el colegio, sobre una alerta que puede ver
export const getExplicacionAlerta = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de alerta inválido' });
    }
    const visibles = await filtroAlertasVisibles(req);
    if (!visibles) return res.status(403).json({ message: SIN_INSTITUCION });

    const alerta = await AlertaRiesgo.findOne({ _id: id, ...visibles })
      .select('origen categoria mensajeDisparador deteccion rutaAtencion').lean();
    if (!alerta) {
      return res.status(404).json({ message: 'Alerta no encontrada' });
    }
    res.json({ explicacion: explicarAlerta(alerta) });
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Integridad de la bitácora de alertas ─────────────────────────────────────
const CAMPOS_CADENA = 'institucionId usuarioId categoria origen mensajeDisparador estado historial createdAt';

const resumenIntegridad = (alerta) => ({ alertaId: alerta._id, ...verificarCadena(alerta) });

export const verificarIntegridadAlerta = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de alerta inválido' });
    }
    const visibles = await filtroAlertasVisibles(req);
    if (!visibles) return res.status(403).json({ message: SIN_INSTITUCION });

    const alerta = await AlertaRiesgo.findOne({ _id: id, ...visibles }).select(CAMPOS_CADENA).lean();
    if (!alerta) {
      return res.status(404).json({ message: 'Alerta no encontrada' });
    }
    res.json({ ...resumenIntegridad(alerta), verificadaEn: new Date() });
  } catch (error) {
    errorInterno(res, error);
  }
};

// todas las alertas que el usuario puede ver: cuántas cuadran y cuáles no
export const verificarIntegridadAlertas = async (req, res) => {
  try {
    const visibles = await filtroAlertasVisibles(req);
    if (!visibles) return res.status(403).json({ message: SIN_INSTITUCION });

    const alertas = await AlertaRiesgo.find(visibles).select(CAMPOS_CADENA).sort({ createdAt: 1 }).lean();
    const resultados = alertas.map(resumenIntegridad);
    const rotas = resultados.filter((r) => !r.valida);
    res.json({
      valida: rotas.length === 0,
      alertas: resultados.length,
      eventos: resultados.reduce((s, r) => s + r.eventos, 0),
      rotas,
      verificadaEn: new Date(),
    });
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Salud de los proveedores de IA (solo administrador) ─────────────────────
export const getSaludIA = (req, res) => {
  res.json(estadoProveedores());
};

// métricas de seguridad de la IA (resultados guardados de la evaluación)
export const getMetricasIA = async (req, res) => {
  try {
    res.json(await resumenMetricas());
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Retos de escuela de padres ───────────────────────────────────────────

export const getTemas = (req, res) => {
  res.json({
    ejes: EJES_CRIANZA.map((eje) => ({
      valor: eje,
      label: EJES_LABELS[eje],
      subtemas: SUBTEMAS_POR_EJE[eje].map((s) => ({ valor: s, label: SUBTEMAS[s] })),
    })),
  });
};

// curso sobre el que el usuario puede crear contenido: el docente dueño o el admin de la institución
const cursoGestionable = async (req, cursoId) => {
  if (!cursoId || !mongoose.isValidObjectId(cursoId)) return null;
  const curso = await Curso.findById(cursoId).select('nombre docenteId institucionId').lean();  if (!curso) return null;
  const esDueño = req.user.rol === 'docente' && curso.docenteId?.toString() === req.user.userId;
  const esAdmin = req.user.rol === 'administrador' && curso.institucionId?.toString() === req.user.institucionId;
  return esDueño || esAdmin ? curso : null;
};

// borrador de reto de escuela de padres; el docente lo ajusta y lo publica como cualquier reto
export const generarRetoBorrador = async (req, res) => {
  try {
    const { eje, subtema } = req.body;
    const tema = typeof req.body.tema === 'string' ? req.body.tema.trim() : '';
    const enfoque = typeof req.body.enfoque === 'string' ? req.body.enfoque.trim() : '';
    const ajuste = typeof req.body.ajuste === 'string' ? req.body.ajuste.trim() : '';
    const borradorAnterior = req.body.borradorAnterior && typeof req.body.borradorAnterior === 'object'
      ? req.body.borradorAnterior : null;

    if (ajuste.length > 300) {
      return res.status(400).json({ message: 'El ajuste admite máximo 300 caracteres' });
    }
    if (eje && !EJES_CRIANZA.includes(eje)) {
      return res.status(400).json({ message: 'Elige un eje válido del Decreto 459' });
    }
    if (subtema && (!eje || !SUBTEMAS_POR_EJE[eje].includes(subtema))) {
      return res.status(400).json({ message: 'El subtema no pertenece a ese eje' });
    }
    if (tema.length > 150 || enfoque.length > 500) {
      return res.status(400).json({ message: 'El tema admite 150 caracteres y el contexto 500' });
    }

    // contexto opcional: grado (curso) y módulo donde se va a publicar el reto
    const curso = await cursoGestionable(req, req.body.cursoId);
    const modulo = curso && mongoose.isValidObjectId(req.body.moduloId)
      ? await Modulo.findOne({ _id: req.body.moduloId, cursoId: curso._id }).select('titulo').lean()
      : null;
    // sin módulo elegido, Edumon sugiere uno de los del curso
    const modulos = curso && !modulo
      ? await Modulo.find({ cursoId: curso._id }).select('titulo').sort({ createdAt: 1 }).lean()
      : [];
    // lo que rectoría pidió para este grupo (si ya publicó lineamientos)
    const lineamientos = curso ? await contextoLineamientosDelCurso(curso) : null;

    if (!tema && !eje && !lineamientos && !borradorAnterior) {
      return res.status(400).json({ message: 'Escribe un tema o elige un eje' });
    }

    const borrador = await generarRetoEscuelaPadres({
      tema: tema || undefined, eje: eje || undefined, subtema: subtema || undefined, enfoque: enfoque || undefined,
      curso: curso?.nombre, modulo: modulo?.titulo, modulos, lineamientos,
      ajuste: ajuste || undefined, borradorAnterior,
    });
    if (!borrador) {
      return res.status(404).json({ message: 'Edumon no pudo diseñar el reto para ese tema. Intenta con otro tema o elige un eje.' });
    }

    res.json({ borrador });
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Ciclo Edumon: temas anónimos del curso → sugerencia → retos ─────────────
const cursoDelCiclo = async (req) => {
  const curso = await cursoGestionable(req, req.params.cursoId);
  return curso && Curso.findById(curso._id).select('nombre participantes').lean();
};

export const getCicloCurso = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.cursoId)) {
      return res.status(400).json({ message: 'ID de curso inválido' });
    }
    const curso = await cursoDelCiclo(req);
    if (!curso) return res.status(404).json({ message: 'Curso no encontrado o sin permisos sobre él' });
    res.json(await vistaCiclo(curso));
  } catch (error) {
    errorInterno(res, error);
  }
};

export const sugerirDesdeCiclo = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.cursoId)) {
      return res.status(400).json({ message: 'ID de curso inválido' });
    }
    const curso = await cursoDelCiclo(req);
    if (!curso) return res.status(404).json({ message: 'Curso no encontrado o sin permisos sobre él' });
    const sugerencia = await sugerenciaCiclo(curso);
    if (!sugerencia) {
      return res.status(422).json({
        message: `Todavía ningún tema reúne al menos ${MIN_FAMILIAS} familias del curso: no hay datos suficientes para sugerir sin exponer a nadie.`,
        code: 'SIN_TEMAS_SUFICIENTES',
      });
    }
    res.json(sugerencia);
  } catch (error) {
    errorInterno(res, error);
  }
};

// ─── Sugerencias de módulos de escuela de padres ──────────────────────────────
export const sugerirModulosCurso = async (req, res) => {
  try {
    const contexto = typeof req.body.contexto === 'string' ? req.body.contexto.trim() : '';
    if (contexto.length > 300) {
      return res.status(400).json({ message: 'El contexto admite máximo 300 caracteres' });
    }

    const curso = await cursoGestionable(req, req.body.cursoId);
    if (!curso) {
      return res.status(404).json({ message: 'Curso no encontrado o sin permisos sobre él' });
    }

    const existentes = await Modulo.find({ cursoId: curso._id }).distinct('titulo');
    const resultado = await sugerirModulos({ curso: curso.nombre, existentes, contexto: contexto || undefined });
    res.json(resultado);
  } catch (error) {
    errorInterno(res, error);
  }
};
