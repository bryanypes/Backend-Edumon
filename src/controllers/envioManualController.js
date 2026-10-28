import mongoose from 'mongoose';
import { validationResult } from 'express-validator';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import Tarea from '../models/Tarea.js';
import Evento from '../models/Evento.js';
import { crearYEnviarNotificacion } from '../services/notificacionService.js';
import { responderErrorDeDatos } from '../utils/erroresDatos.js';

// Envíos simultáneos al proveedor de push: suficiente para un colegio sin saturar FCM
const LOTE = 10;

const fechaCorta = (f) => new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'America/Bogota' });

/** Institución sobre la que actúa: la del administrador, o la que indique el superadmin. */
function institucionDelActor(req, institucionIdBody) {
  if (req.user.rol === 'administrador') return req.user.institucionId;
  return institucionIdBody || null;
}

/** Ids de destinatarios activos según alcance (curso/colegio) y a quién (familias/docentes/todos). */
async function resolverDestinatarios({ cursos, destinatarios, institucionId }) {
  const ids = new Set();
  const quiereFamilias = destinatarios !== 'docentes';
  const quiereDocentes = destinatarios !== 'familias';
  for (const curso of cursos) {
    for (const p of curso.participantes ?? []) {
      if ((p.etiqueta === 'padre' && quiereFamilias) || (p.etiqueta === 'docente' && quiereDocentes)) ids.add(String(p.usuarioId));
    }
    if (quiereDocentes && curso.docenteId) ids.add(String(curso.docenteId));
  }
  if (quiereDocentes && institucionId) {
    const docentes = await User.find({ rol: 'docente', institucionId }).select('_id').lean();
    docentes.forEach((d) => ids.add(String(d._id)));
  }
  if (!ids.size) return [];
  const activos = await User.find({ _id: { $in: [...ids] }, estado: { $ne: 'suspendido' } }).select('_id').lean();
  return activos.map((u) => u._id);
}

/**
 * POST /api/notificaciones/enviar — el colegio envía un aviso (push + notificación en la app)
 * a un curso o a todo el colegio. Puede ser un aviso libre o el recordatorio de un reto o evento.
 */
export const enviarNotificacionManual = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
    }

    const { alcance, cursoId, destinatarios = 'familias', tareaId, eventoId, titulo, correo = false } = req.body;
    let { mensaje } = req.body;

    const institucionId = institucionDelActor(req, req.body.institucionId);
    if (!institucionId && !(alcance === 'curso' && req.user.rol === 'superadmin')) {
      return res.status(400).json({ message: 'Indica la institución a la que va el aviso' });
    }

    // cursos destino, siempre dentro de la institución del actor
    let cursos;
    if (alcance === 'curso') {
      const curso = await Curso.findById(cursoId).select('participantes docenteId institucionId nombre').lean();
      if (!curso) return res.status(404).json({ message: 'Curso no encontrado' });
      if (req.user.rol === 'administrador' && String(curso.institucionId) !== String(institucionId)) {
        return res.status(403).json({ message: 'Solo puedes enviar avisos a cursos de tu institución' });
      }
      cursos = [curso];
    } else {
      cursos = await Curso.find({ institucionId, estado: { $ne: 'archivado' } }).select('participantes docenteId institucionId nombre').lean();
    }
    const idsCursos = cursos.map((c) => String(c._id));

    // recordatorio de un reto o evento: debe ser de esos cursos
    let tipo = 'sistema';
    let referenciaId;
    let referenciaModelo;
    if (tareaId) {
      const tarea = await Tarea.findById(tareaId).select('titulo fechaEntrega cursoId').lean();
      if (!tarea || !idsCursos.includes(String(tarea.cursoId))) {
        return res.status(404).json({ message: 'El reto no existe o no es de ese curso' });
      }
      tipo = 'tarea'; referenciaId = tarea._id; referenciaModelo = 'Tarea';
      mensaje ||= `Recordatorio: el reto «${tarea.titulo}» se entrega el ${fechaCorta(tarea.fechaEntrega)}.`;
    } else if (eventoId) {
      const evento = await Evento.findById(eventoId).select('titulo fechaInicio hora cursosIds').lean();
      if (!evento || !(evento.cursosIds ?? []).some((c) => idsCursos.includes(String(c)))) {
        return res.status(404).json({ message: 'El evento no existe o no es de ese curso' });
      }
      tipo = 'evento'; referenciaId = evento._id; referenciaModelo = 'Evento';
      mensaje ||= `Recordatorio: «${evento.titulo}» es el ${fechaCorta(evento.fechaInicio)}${evento.hora ? ` a las ${evento.hora}` : ''}.`;
    }
    if (!mensaje) return res.status(400).json({ message: 'Escribe el mensaje del aviso' });

    const usuarios = await resolverDestinatarios({ cursos, destinatarios, institucionId: alcance === 'colegio' ? institucionId : null });
    if (!usuarios.length) {
      return res.status(400).json({ message: 'No hay destinatarios activos para ese aviso' });
    }

    const agrupacionId = new mongoose.Types.ObjectId().toString();
    const resultado = { destinatarios: usuarios.length, enviadas: 0, conPush: 0, fallidas: 0 };
    for (let i = 0; i < usuarios.length; i += LOTE) {
      const lote = await Promise.allSettled(usuarios.slice(i, i + LOTE).map((usuarioId) => crearYEnviarNotificacion({
        usuarioId, tipo, mensaje, prioridad: 'alta', referenciaId, referenciaModelo, agrupacionId,
        omitirCorreo: !correo,
        metadata: { manual: true, enviadoPor: req.user.userId, ...(titulo ? { titulo } : {}) },
      })));
      for (const r of lote) {
        if (r.status === 'fulfilled') {
          resultado.enviadas += 1;
          if (r.value?.canalEnviado?.push) resultado.conPush += 1;
        } else resultado.fallidas += 1;
      }
    }

    res.status(201).json({ message: 'Aviso enviado', agrupacionId, ...resultado });
  } catch (error) {
    if (responderErrorDeDatos(res, error)) return;
    console.error('Error al enviar el aviso manual:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
