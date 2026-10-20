import mongoose from 'mongoose';
import LineamientoEscuelaPadres from '../models/LineamientoEscuelaPadres.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import notificador from '../notifications/NotificadorFacade.js';
import {
  textoDePdf, redactarLineamientos, sanearContenido, seguimientoPorCurso, detalleParticipacionCurso,
} from '../services/ia/lineamientos.js';

const MAX_TEXTO = 60000;
const MAX_INSTRUCCIONES = 3000;

const errorInterno = (res, error) => res.status(500).json({
  message: 'Error interno',
  error: process.env.NODE_ENV === 'development' ? error.message : undefined,
});

const SIN_INSTITUCION = 'No tienes una institución asignada';
const esAdmin = (req) => req.user.rol === 'administrador';

const cursosDeLaInstitucion = (institucionId) => Curso.find({ institucionId, estado: 'activo' })
  .select('nombre').sort({ nombre: 1 }).lean();

const conCursos = async (lineamiento, institucionId) => ({
  lineamiento,
  cursos: await cursosDeLaInstitucion(institucionId),
});

/**
 * GET /ia/lineamientos
 * Admin: borrador y publicado. Docente: solo lo publicado (o null).
 */
export const getLineamientos = async (req, res) => {
  try {
    const { institucionId } = req.user;
    if (!institucionId) return res.status(403).json({ message: SIN_INSTITUCION });

    const lineamiento = await LineamientoEscuelaPadres.findOne({ institucionId })
      .populate('publicadoPor', 'nombre apellido')
      .lean();

    if (esAdmin(req)) return res.json(await conCursos(lineamiento, institucionId));

    // el docente no ve el texto fuente ni el borrador en edición
    const publicado = lineamiento?.publicado
      ? {
        publicado: lineamiento.publicado,
        version: lineamiento.version,
        publicadoEn: lineamiento.publicadoEn,
        publicadoPor: lineamiento.publicadoPor,
      }
      : null;
    res.json(await conCursos(publicado, institucionId));
  } catch (error) {
    errorInterno(res, error);
  }
};

/**
 * POST /ia/lineamientos/borrador (multipart: archivo PDF opcional, texto, instrucciones)
 * Edumon redacta los lineamientos y los deja como borrador (no publica).
 */
export const generarBorradorLineamientos = async (req, res) => {
  try {
    const { institucionId } = req.user;
    if (!institucionId) return res.status(403).json({ message: SIN_INSTITUCION });

    const textoPegado = typeof req.body.texto === 'string' ? req.body.texto.trim() : '';
    const instrucciones = typeof req.body.instrucciones === 'string' ? req.body.instrucciones.trim() : '';
    if (instrucciones.length > MAX_INSTRUCCIONES) {
      return res.status(400).json({ message: `Las indicaciones admiten máximo ${MAX_INSTRUCCIONES} caracteres` });
    }

    let textoPdf = '';
    if (req.file) {
      try {
        textoPdf = await textoDePdf(req.file.buffer);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(422).json({ message: 'No pude leer ese PDF. Si es un documento escaneado, pega el texto del comunicado.' });
      }
      if (textoPdf.length < 40) {
        return res.status(422).json({ message: 'El PDF no tiene texto que se pueda leer (parece escaneado). Pega el texto del comunicado.' });
      }
    }

    const texto = [textoPdf, textoPegado].filter(Boolean).join('\n\n').slice(0, MAX_TEXTO);
    if (!texto && !instrucciones) {
      return res.status(400).json({ message: 'Sube el PDF, pega el comunicado o escribe tus indicaciones' });
    }

    const cursos = await cursosDeLaInstitucion(institucionId);
    const { contenido, generadoPor } = await redactarLineamientos({ texto, instrucciones, cursos });

    const lineamiento = await LineamientoEscuelaPadres.findOneAndUpdate(
      { institucionId },
      {
        $set: {
          borrador: contenido,
          generadoPor,
          fuente: { texto, archivoNombre: req.file?.originalname ?? null, instrucciones },
          actualizadoPor: req.user.userId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).populate('publicadoPor', 'nombre apellido').lean();

    res.status(201).json({ ...(await conCursos(lineamiento, institucionId)), leidoDelPdf: textoPdf.length });
  } catch (error) {
    errorInterno(res, error);
  }
};

/** PUT /ia/lineamientos — el admin guarda su versión editada del borrador */
export const guardarBorradorLineamientos = async (req, res) => {
  try {
    const { institucionId } = req.user;
    if (!institucionId) return res.status(403).json({ message: SIN_INSTITUCION });
    if (!req.body?.borrador || typeof req.body.borrador !== 'object') {
      return res.status(400).json({ message: 'Falta el contenido de los lineamientos' });
    }

    const cursos = await cursosDeLaInstitucion(institucionId);
    const lineamiento = await LineamientoEscuelaPadres.findOneAndUpdate(
      { institucionId },
      { $set: { borrador: sanearContenido(req.body.borrador, cursos), actualizadoPor: req.user.userId } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    ).populate('publicadoPor', 'nombre apellido').lean();

    res.json({ ...(await conCursos(lineamiento, institucionId)), message: 'Borrador guardado' });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
    errorInterno(res, error);
  }
};

/**
 * POST /ia/lineamientos/publicar — el borrador pasa a ser lo vigente y se avisa
 * a todos los docentes activos de la institución.
 */
export const publicarLineamientos = async (req, res) => {
  try {
    const { institucionId } = req.user;
    if (!institucionId) return res.status(403).json({ message: SIN_INSTITUCION });

    const actual = await LineamientoEscuelaPadres.findOne({ institucionId });
    if (!actual?.borrador || (!actual.borrador.objetivo && !actual.borrador.indicacionesDocentes?.length)) {
      return res.status(400).json({ message: 'Completa al menos el objetivo o las indicaciones antes de publicar' });
    }

    actual.publicado = actual.borrador.toObject();
    actual.version += 1;
    actual.publicadoEn = new Date();
    actual.publicadoPor = req.user.userId;
    await actual.save();

    const docentes = await User.find({ institucionId, rol: 'docente', estado: 'activo' }).distinct('_id');
    const mensaje = actual.version === 1
      ? 'Rectoría publicó los lineamientos de escuela de padres. Revísalos antes de crear tus próximos retos.'
      : `Rectoría actualizó los lineamientos de escuela de padres (versión ${actual.version}). Revisa los cambios.`;
    await Promise.all(docentes.map((usuarioId) => notificador.notificar(usuarioId, {
      tipo: 'sistema',
      mensaje,
      prioridad: 'alta',
      metadata: { destino: '/escuela-padres/lineamientos', version: actual.version },
    })));

    const lineamiento = await LineamientoEscuelaPadres.findById(actual._id).populate('publicadoPor', 'nombre apellido').lean();
    res.json({ ...(await conCursos(lineamiento, institucionId)), docentesNotificados: docentes.length });
  } catch (error) {
    errorInterno(res, error);
  }
};

/**
 * GET /ia/lineamientos/seguimiento/:cursoId
 * Trazabilidad por familia de un grupo (retos entregados y encuentros asistidos).
 * Admin de la institución o docente del grupo.
 */
export const getDetalleParticipacion = async (req, res) => {
  try {
    const { institucionId } = req.user;
    if (!institucionId) return res.status(403).json({ message: SIN_INSTITUCION });
    const { cursoId } = req.params;
    if (!mongoose.isValidObjectId(cursoId)) return res.status(400).json({ message: 'ID de curso inválido' });

    const filtro = esAdmin(req) ? { _id: cursoId, institucionId } : { _id: cursoId, institucionId, docenteId: req.user.userId };
    const curso = await Curso.findOne(filtro).select('nombre participantes').lean();
    if (!curso) return res.status(404).json({ message: 'Grupo no encontrado' });

    const lineamiento = await LineamientoEscuelaPadres.findOne({ institucionId }).select('publicado').lean();
    res.json(await detalleParticipacionCurso(curso, lineamiento?.publicado ?? null));
  } catch (error) {
    errorInterno(res, error);
  }
};

/**
 * GET /ia/lineamientos/seguimiento
 * Admin: todos los grupos. Docente: solo sus cursos.
 */
export const getSeguimientoLineamientos = async (req, res) => {
  try {
    const { institucionId } = req.user;
    if (!institucionId) return res.status(403).json({ message: SIN_INSTITUCION });

    const lineamiento = await LineamientoEscuelaPadres.findOne({ institucionId }).select('publicado').lean();
    const soloCursos = esAdmin(req)
      ? null
      : await Curso.find({ institucionId, docenteId: req.user.userId }).distinct('_id');

    const seguimiento = await seguimientoPorCurso(institucionId, lineamiento?.publicado ?? null, { soloCursos });
    res.json({ ...seguimiento, hayLineamientos: Boolean(lineamiento?.publicado) });
  } catch (error) {
    errorInterno(res, error);
  }
};
