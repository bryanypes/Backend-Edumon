import Evento from '../models/Evento.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';

// ─── Crear evento ─────────────────────────────
export const createEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { userId, rol } = req.user;

    if (!['administrador', 'docente'].includes(rol)) {
      return res.status(403).json({ message: "No tienes permisos para crear eventos" });
    }

    let { titulo, descripcion, fechaInicio, fechaFin, hora, ubicacion, cursosIds, categoria } = req.body;

    if (typeof cursosIds === 'string') {
      try { cursosIds = JSON.parse(cursosIds); } catch {
        return res.status(400).json({ message: "El formato de cursosIds es inválido" });
      }
    }

    if (!Array.isArray(cursosIds) || cursosIds.length === 0) {
      return res.status(400).json({ message: "cursosIds debe ser un array con al menos un ID de curso" });
    }

    const cursosExisten = await Curso.find({ _id: { $in: cursosIds } });
    if (cursosExisten.length !== cursosIds.length) {
      return res.status(404).json({ message: "Uno o más cursos no existen" });
    }

    if (rol === 'docente') {
      const cursosDelDocente = cursosExisten.filter(c => c.docenteId.toString() === userId);
      if (cursosDelDocente.length !== cursosIds.length) {
        return res.status(403).json({ message: "Solo puedes crear eventos para tus propios cursos" });
      }
    }

    // Imagen de portada (campo 'imagenPortada' del form)
    let imagenPortada = { url: null, publicId: null };
    if (req.files?.imagenPortada?.[0]) {
      const file = req.files.imagenPortada[0];
      const resultado = await subirArchivoCloudinary(file.buffer, file.mimetype, 'eventos-portadas');
      imagenPortada = { url: resultado.url, publicId: resultado.publicId };
    }

    // Adjunto adicional (campo 'adjunto' del form)
    let adjuntos = { url: null, publicId: null, nombre: null };
    if (req.files?.adjunto?.[0]) {
      const file = req.files.adjunto[0];
      const resultado = await subirArchivoCloudinary(file.buffer, file.mimetype, 'eventos-adjuntos', file.originalname);
      adjuntos = { url: resultado.url, publicId: resultado.publicId, nombre: file.originalname };
    }

    const nuevoEvento = new Evento({
      titulo, descripcion, fechaInicio, fechaFin, hora, ubicacion,
      docenteId: userId,
      cursosIds,
      categoria,
      imagenPortada,
      adjuntos
    });

    const eventoGuardado = await nuevoEvento.save();

    const eventoCompleto = await Evento.findById(eventoGuardado._id)
      .populate('docenteId', 'nombre apellido correo')
      .populate('cursosIds', 'nombre codigoCurso');

    eventBus.publicar(EVENTOS.EVENTO_CREADO, eventoCompleto);

    res.status(201).json({ message: "Evento creado exitosamente", evento: eventoCompleto });
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ message: "Error interno del servidor", error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// ─── Listar eventos ───────────────────────────
export const getEventos = async (req, res) => {
  try {
    const { userId, rol } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const { categoria, estado, cursoId } = req.query;

    const filter = {};
    if (categoria) filter.categoria = categoria;
    if (estado) filter.estado = estado;
    if (cursoId) filter.cursosIds = cursoId;

    if (rol === 'docente') filter.docenteId = userId;

    if (rol === 'padre') {
      const cursosDelPadre = await Curso.find({
        'participantes.usuarioId': userId,
        'participantes.etiqueta': 'padre'
      }).distinct('_id');
      filter.cursosIds = { $in: cursosDelPadre };
    }

    const eventos = await Evento.find(filter)
      .populate('docenteId', 'nombre apellido correo')
      .populate('cursosIds', 'nombre codigoCurso')
      .skip(skip).limit(limit).sort({ fechaInicio: -1 });

    const total = await Evento.countDocuments(filter);

    res.json({
      eventos,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalEventos: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Obtener evento por ID ────────────────────
export const getEventoById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { userId, rol } = req.user;

    const evento = await Evento.findById(id)
      .populate('docenteId', 'nombre apellido correo')
      .populate({
        path: 'cursosIds',
        select: 'nombre codigoCurso participantes',
        populate: { path: 'participantes.usuarioId', select: 'nombre apellido correo rol' }
      });

    if (!evento) return res.status(404).json({ message: "Evento no encontrado" });

    if (rol === 'docente' && evento.docenteId._id.toString() !== userId) {
      return res.status(403).json({ message: "No tienes permiso para ver este evento" });
    }

    if (rol === 'padre') {
      const cursosDelPadre = await Curso.find({
        'participantes.usuarioId': userId,
        'participantes.etiqueta': 'padre'
      }).distinct('_id');

      const tieneAcceso = evento.cursosIds.some(curso =>
        cursosDelPadre.some(id => id.equals(curso._id))
      );

      if (!tieneAcceso) return res.status(403).json({ message: "No tienes permiso para ver este evento" });
    }

    res.json(evento);
  } catch (error) {
    console.error('Error al obtener evento:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Actualizar evento ────────────────────────
export const updateEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { userId, rol } = req.user;
    const updateData = { ...req.body };

    const evento = await Evento.findById(id);
    if (!evento) return res.status(404).json({ message: "Evento no encontrado" });

    if (rol === 'docente' && evento.docenteId.toString() !== userId) {
      return res.status(403).json({ message: "No tienes permiso para actualizar este evento" });
    }

    delete updateData._id;
    delete updateData.docenteId;
    delete updateData.fechaCreacion;

    // Actualizar imagen de portada
    if (req.files?.imagenPortada?.[0]) {
      // Eliminar imagen anterior si existe
      if (evento.imagenPortada?.publicId) {
        await eliminarArchivoCloudinary(evento.imagenPortada.publicId, 'image').catch(() => {});
      }
      const file = req.files.imagenPortada[0];
      const resultado = await subirArchivoCloudinary(file.buffer, file.mimetype, 'eventos-portadas');
      updateData.imagenPortada = { url: resultado.url, publicId: resultado.publicId };
    }

    // Actualizar adjunto
    if (req.files?.adjunto?.[0]) {
      if (evento.adjuntos?.publicId) {
        await eliminarArchivoCloudinary(evento.adjuntos.publicId, 'raw').catch(() => {});
      }
      const file = req.files.adjunto[0];
      const resultado = await subirArchivoCloudinary(file.buffer, file.mimetype, 'eventos-adjuntos', file.originalname);
      updateData.adjuntos = { url: resultado.url, publicId: resultado.publicId, nombre: file.originalname };
    }

    const eventoActualizado = await Evento.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .populate('docenteId', 'nombre apellido correo')
      .populate('cursosIds', 'nombre codigoCurso');

    res.json({ message: "Evento actualizado exitosamente", evento: eventoActualizado });
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Eliminar evento ──────────────────────────
export const deleteEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { userId, rol } = req.user;

    const evento = await Evento.findById(id);
    if (!evento) return res.status(404).json({ message: "Evento no encontrado" });

    if (rol === 'docente' && evento.docenteId.toString() !== userId) {
      return res.status(403).json({ message: "No tienes permiso para eliminar este evento" });
    }

    // Eliminar imagen de portada
    if (evento.imagenPortada?.publicId) {
      await eliminarArchivoCloudinary(evento.imagenPortada.publicId, 'image').catch(() => {});
    }

    // Eliminar adjunto
    if (evento.adjuntos?.publicId) {
      await eliminarArchivoCloudinary(evento.adjuntos.publicId, 'raw').catch(() => {});
    }

    await Evento.findByIdAndDelete(id);
    res.json({ message: "Evento eliminado exitosamente" });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Eventos del día ──────────────────────────
export const getEventosHoy = async (req, res) => {
  try {
    const { userId, rol } = req.user;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    const filter = { fechaInicio: { $gte: hoy, $lt: mañana } };

    if (rol === 'docente') filter.docenteId = userId;
    else if (rol === 'padre') {
      const cursosDelPadre = await Curso.find({
        'participantes.usuarioId': userId,
        'participantes.etiqueta': 'padre'
      }).distinct('_id');
      filter.cursosIds = { $in: cursosDelPadre };
    }

    const eventos = await Evento.find(filter)
      .populate('docenteId', 'nombre apellido')
      .populate('cursosIds', 'nombre')
      .sort({ hora: 1 });

    res.json({ eventos, total: eventos.length });
  } catch (error) {
    console.error('Error al obtener eventos de hoy:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};