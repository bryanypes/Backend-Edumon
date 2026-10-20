import mongoose from 'mongoose';
import Evento from '../models/Evento.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import AsistenciaEncuentro from '../models/AsistenciaEncuentro.js';

const errorInterno = (res, error) => res.status(500).json({
  message: 'Error interno',
  error: process.env.NODE_ENV === 'development' ? error.message : undefined,
});

const MODALIDADES = ['presencial', 'virtual'];

/**
 * El encuentro y los grupos donde el usuario puede marcar asistencia: el admin,
 * los de su institución; el docente, los suyos. { error, status } si no puede.
 */
async function encuentroGestionable(req, eventoId) {
  if (!mongoose.isValidObjectId(eventoId)) return { status: 400, error: 'ID de evento inválido' };
  const evento = await Evento.findById(eventoId).select('titulo fechaInicio fechaFin hora ubicacion categoria estado cursosIds').lean();
  if (!evento) return { status: 404, error: 'Evento no encontrado' };
  if (evento.categoria !== 'escuela_padres') {
    return { status: 400, error: 'Solo los encuentros de escuela de padres llevan registro de asistencia' };
  }

  const { rol, userId, institucionId } = req.user;
  const filtro = rol === 'administrador'
    ? { _id: { $in: evento.cursosIds }, institucionId }
    : { _id: { $in: evento.cursosIds }, docenteId: userId };
  const cursos = await Curso.find(filtro).select('nombre participantes institucionId').lean();
  if (!cursos.length) return { status: 403, error: 'No tienes grupos en este encuentro' };

  return { evento, cursos };
}

// familias (participantes "padre") de cada grupo con lo que ya está marcado
async function armarLista(evento, cursos) {
  const idsFamilias = [...new Set(cursos.flatMap((c) => c.participantes
    .filter((p) => p.etiqueta === 'padre').map((p) => String(p.usuarioId))))];
  const [usuarios, registros] = await Promise.all([
    User.find({ _id: { $in: idsFamilias } }).select('nombre apellido').lean(),
    AsistenciaEncuentro.find({ eventoId: evento._id, usuarioId: { $in: idsFamilias } })
      .populate('marcadoPor', 'nombre apellido').lean(),
  ]);
  const usuarioPorId = new Map(usuarios.map((u) => [String(u._id), u]));
  const registroPorId = new Map(registros.map((r) => [String(r.usuarioId), r]));

  const grupos = cursos.map((c) => ({
    cursoId: c._id,
    nombre: c.nombre,
    familias: c.participantes
      .filter((p) => p.etiqueta === 'padre' && usuarioPorId.has(String(p.usuarioId)))
      .map((p) => {
        const u = usuarioPorId.get(String(p.usuarioId));
        const r = registroPorId.get(String(p.usuarioId));
        return {
          usuarioId: u._id,
          nombre: `${u.nombre} ${u.apellido ?? ''}`.trim(),
          asistio: r ? r.asistio : null, // null = sin marcar
          modalidad: r?.modalidad ?? null,
          marcadoPor: r?.marcadoPor ? `${r.marcadoPor.nombre} ${r.marcadoPor.apellido ?? ''}`.trim() : null,
          marcadoEn: r?.marcadoEn ?? null,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }));

  const todas = grupos.flatMap((g) => g.familias);
  return {
    evento: {
      _id: evento._id, titulo: evento.titulo, fechaInicio: evento.fechaInicio,
      hora: evento.hora, ubicacion: evento.ubicacion, estado: evento.estado,
    },
    grupos,
    resumen: {
      familias: todas.length,
      asistieron: todas.filter((f) => f.asistio === true).length,
      sinMarcar: todas.filter((f) => f.asistio === null).length,
    },
  };
}

/** GET /eventos/:id/asistencia */
export const getAsistencia = async (req, res) => {
  try {
    const r = await encuentroGestionable(req, req.params.id);
    if (r.error) return res.status(r.status).json({ message: r.error });
    res.json(await armarLista(r.evento, r.cursos));
  } catch (error) {
    errorInterno(res, error);
  }
};

/**
 * PUT /eventos/:id/asistencia  { registros: [{ usuarioId, asistio, modalidad }] }
 * Solo familias de los grupos del usuario. Cada cambio queda en el historial.
 */
export const marcarAsistencia = async (req, res) => {
  try {
    const r = await encuentroGestionable(req, req.params.id);
    if (r.error) return res.status(r.status).json({ message: r.error });
    const { evento, cursos } = r;

    if (evento.estado === 'cancelado') {
      return res.status(400).json({ message: 'El encuentro fue cancelado' });
    }
    const finDeHoy = new Date();
    finDeHoy.setHours(23, 59, 59, 999);
    if (new Date(evento.fechaInicio) > finDeHoy) {
      return res.status(400).json({ message: 'La asistencia se marca el día del encuentro o después' });
    }

    const registros = Array.isArray(req.body?.registros) ? req.body.registros : null;
    if (!registros?.length || registros.length > 500) {
      return res.status(400).json({ message: 'Envía la lista de familias a marcar' });
    }

    // a qué grupo pertenece cada familia (la primera coincidencia cuenta)
    const cursoDeFamilia = new Map();
    for (const c of cursos) {
      for (const p of c.participantes) {
        if (p.etiqueta === 'padre' && !cursoDeFamilia.has(String(p.usuarioId))) cursoDeFamilia.set(String(p.usuarioId), c);
      }
    }

    for (const reg of registros) {
      if (!cursoDeFamilia.has(String(reg?.usuarioId)) || typeof reg.asistio !== 'boolean') {
        return res.status(400).json({ message: 'Hay familias que no pertenecen a tus grupos o datos inválidos' });
      }
      if (reg.modalidad !== undefined && !MODALIDADES.includes(reg.modalidad)) {
        return res.status(400).json({ message: 'Modalidad inválida (presencial o virtual)' });
      }
    }

    const ahora = new Date();
    const existentes = new Map((await AsistenciaEncuentro.find({
      eventoId: evento._id, usuarioId: { $in: registros.map((x) => x.usuarioId) },
    }).select('usuarioId asistio modalidad').lean()).map((x) => [String(x.usuarioId), x]));

    const operaciones = registros.flatMap((reg) => {
      const modalidad = reg.asistio ? (reg.modalidad ?? 'presencial') : 'presencial';
      const previo = existentes.get(String(reg.usuarioId));
      // sin cambios: no se toca (el historial solo registra cambios reales)
      if (previo && previo.asistio === reg.asistio && previo.modalidad === modalidad) return [];
      const curso = cursoDeFamilia.get(String(reg.usuarioId));
      return [{
        updateOne: {
          filter: { eventoId: evento._id, usuarioId: reg.usuarioId },
          update: {
            $set: {
              asistio: reg.asistio, modalidad, marcadoPor: req.user.userId, marcadoEn: ahora,
              cursoId: curso._id, institucionId: curso.institucionId,
            },
            $push: { historial: { asistio: reg.asistio, modalidad, por: req.user.userId, en: ahora } },
          },
          upsert: true,
        },
      }];
    });
    if (operaciones.length) await AsistenciaEncuentro.bulkWrite(operaciones);

    res.json({ ...(await armarLista(evento, cursos)), cambios: operaciones.length });
  } catch (error) {
    errorInterno(res, error);
  }
};
