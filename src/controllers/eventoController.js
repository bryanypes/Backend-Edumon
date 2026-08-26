import Evento from '../models/Evento.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { getFileBuffer } from '../utils/fileUploadHelper.js';

// docente y padre ya se acotan a sus propios cursos/eventos en este archivo; a
// administrador nunca se le restringía a su propia institución, por lo que podía
// ver/editar/borrar eventos de CUALQUIER institución de la plataforma.
async function eventoPerteneceAInstitucion(cursosIds, institucionId) {
  if (!cursosIds || cursosIds.length === 0) return false;
  const count = await Curso.countDocuments({ _id: { $in: cursosIds }, institucionId });
  return count === cursosIds.length;
}

// Crear evento
export const createEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { userId, rol, institucionId } = req.user;

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

    if (rol === 'administrador') {
      const cursosDeLaInstitucion = cursosExisten.filter(c => c.institucionId.toString() === institucionId);
      if (cursosDeLaInstitucion.length !== cursosIds.length) {
        return res.status(403).json({ message: "Solo puedes crear eventos para cursos de tu institución" });
      }
    }

    // Imagen de portada y adjunto son subidas independientes: se suben en paralelo
    let imagenPortada = { url: null, publicId: null };
    let adjuntos = { url: null, publicId: null, nombre: null };

    const subidas = [];
    if (req.files?.imagenPortada?.[0]) {
      const file = req.files.imagenPortada[0];
      const fileBuffer = await getFileBuffer(file);
      if (fileBuffer) {
        subidas.push(
          subirArchivoCloudinary(fileBuffer, file.mimetype, 'eventos-portadas')
            .then(resultado => { imagenPortada = { url: resultado.url, publicId: resultado.publicId }; })
        );
      }
    }
    if (req.files?.adjunto?.[0]) {
      const file = req.files.adjunto[0];
      const fileBuffer = await getFileBuffer(file);
      if (fileBuffer) {
        subidas.push(
          subirArchivoCloudinary(fileBuffer, file.mimetype, 'eventos-adjuntos', file.originalname)
            .then(resultado => { adjuntos = { url: resultado.url, publicId: resultado.publicId, nombre: file.originalname }; })
        );
      }
    }
    if (subidas.length > 0) await Promise.all(subidas);

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

// Listar eventos
export const getEventos = async (req, res) => {
  try {
    const { userId, rol, institucionId } = req.user;
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

    if (rol === 'administrador') {
      // Sin este filtro, un administrador veía eventos de TODAS las instituciones.
      const cursosDeLaInstitucion = await Curso.find({ institucionId }).distinct('_id');
      filter.cursosIds = { $in: cursosDeLaInstitucion };
    }

    const [eventos, total] = await Promise.all([
      Evento.find(filter)
        .populate('docenteId', 'nombre apellido correo')
        .populate('cursosIds', 'nombre codigoCurso')
        .skip(skip).limit(limit).sort({ fechaInicio: -1 }),
      Evento.countDocuments(filter)
    ]);

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

// Obtener evento por ID
export const getEventoById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { userId, rol, institucionId } = req.user;

    const evento = await Evento.findById(id)
      .populate('docenteId', 'nombre apellido correo')
      .populate({
        path: 'cursosIds',
        select: 'nombre codigoCurso participantes institucionId',
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

    if (rol === 'administrador') {
      const esDeMiInstitucion = evento.cursosIds.every(curso => curso.institucionId?.toString() === institucionId);
      if (!esDeMiInstitucion) return res.status(403).json({ message: "No tienes permiso para ver este evento" });
    }

    res.json(evento);
  } catch (error) {
    console.error('Error al obtener evento:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Actualizar evento
export const updateEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { userId, rol, institucionId } = req.user;
    const updateData = { ...req.body };

    if (!['administrador', 'docente'].includes(rol)) {
      return res.status(403).json({ message: "No tienes permisos para actualizar eventos" });
    }

    const evento = await Evento.findById(id);
    if (!evento) return res.status(404).json({ message: "Evento no encontrado" });

    if (rol === 'docente' && evento.docenteId.toString() !== userId) {
      return res.status(403).json({ message: "No tienes permiso para actualizar este evento" });
    }

    if (rol === 'administrador' && !(await eventoPerteneceAInstitucion(evento.cursosIds, institucionId))) {
      return res.status(403).json({ message: "No tienes permiso para actualizar este evento" });
    }

    delete updateData._id;
    delete updateData.docenteId;
    delete updateData.fechaCreacion;

    // Actualizar imagen de portada / adjunto: operaciones independientes en paralelo
    const actualizaciones = [];

    if (req.files?.imagenPortada?.[0]) {
      actualizaciones.push((async () => {
        if (evento.imagenPortada?.publicId) {
          await eliminarArchivoCloudinary(evento.imagenPortada.publicId, 'image').catch(() => {});
        }
        const file = req.files.imagenPortada[0];
        const fileBuffer = await getFileBuffer(file);
        if (!fileBuffer) {
          throw new Error('No se pudo leer la imagen del evento');
        }
        const resultado = await subirArchivoCloudinary(fileBuffer, file.mimetype, 'eventos-portadas');
        updateData.imagenPortada = { url: resultado.url, publicId: resultado.publicId };
      })());
    }

    if (req.files?.adjunto?.[0]) {
      actualizaciones.push((async () => {
        if (evento.adjuntos?.publicId) {
          await eliminarArchivoCloudinary(evento.adjuntos.publicId, 'raw').catch(() => {});
        }
        const file = req.files.adjunto[0];
        const fileBuffer = await getFileBuffer(file);
        if (!fileBuffer) {
          throw new Error('No se pudo leer el adjunto del evento');
        }
        const resultado = await subirArchivoCloudinary(fileBuffer, file.mimetype, 'eventos-adjuntos', file.originalname);
        updateData.adjuntos = { url: resultado.url, publicId: resultado.publicId, nombre: file.originalname };
      })());
    }

    if (actualizaciones.length > 0) await Promise.all(actualizaciones);

    const eventoActualizado = await Evento.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .populate('docenteId', 'nombre apellido correo')
      .populate('cursosIds', 'nombre codigoCurso');

    res.json({ message: "Evento actualizado exitosamente", evento: eventoActualizado });
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Eliminar evento
export const deleteEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { userId, rol, institucionId } = req.user;

    if (!['administrador', 'docente'].includes(rol)) {
      return res.status(403).json({ message: "No tienes permisos para eliminar eventos" });
    }

    const evento = await Evento.findById(id);
    if (!evento) return res.status(404).json({ message: "Evento no encontrado" });

    if (rol === 'docente' && evento.docenteId.toString() !== userId) {
      return res.status(403).json({ message: "No tienes permiso para eliminar este evento" });
    }

    if (rol === 'administrador' && !(await eventoPerteneceAInstitucion(evento.cursosIds, institucionId))) {
      return res.status(403).json({ message: "No tienes permiso para eliminar este evento" });
    }

    const limpiezas = [];
    if (evento.imagenPortada?.publicId) {
      limpiezas.push(eliminarArchivoCloudinary(evento.imagenPortada.publicId, 'image').catch(() => {}));
    }
    if (evento.adjuntos?.publicId) {
      limpiezas.push(eliminarArchivoCloudinary(evento.adjuntos.publicId, 'raw').catch(() => {}));
    }
    if (limpiezas.length > 0) await Promise.all(limpiezas);

    await Evento.findByIdAndDelete(id);
    res.json({ message: "Evento eliminado exitosamente" });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Cancelar evento
// El estado "cancelado" ya existía en el enum del schema, pero ningún
// controlador lo asignaba. Usa findByIdAndUpdate (no .save()) a propósito:
// el pre('save') del modelo recalcula el estado por fecha en cada save() y
// pisaría "cancelado" apenas el evento ya hubiera empezado.
export const cancelarEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { userId, rol, institucionId } = req.user;

    if (!['administrador', 'docente'].includes(rol)) {
      return res.status(403).json({ message: "No tienes permisos para cancelar eventos" });
    }

    const evento = await Evento.findById(id);
    if (!evento) return res.status(404).json({ message: "Evento no encontrado" });

    if (rol === 'docente' && evento.docenteId.toString() !== userId) {
      return res.status(403).json({ message: "No tienes permiso para cancelar este evento" });
    }

    if (rol === 'administrador' && !(await eventoPerteneceAInstitucion(evento.cursosIds, institucionId))) {
      return res.status(403).json({ message: "No tienes permiso para cancelar este evento" });
    }

    if (evento.estado === 'cancelado') {
      return res.status(400).json({ message: "El evento ya está cancelado" });
    }
    if (evento.estado === 'finalizado') {
      return res.status(400).json({ message: "No se puede cancelar un evento que ya finalizó" });
    }

    const eventoCancelado = await Evento.findByIdAndUpdate(id, { estado: 'cancelado' }, { new: true })
      .populate('docenteId', 'nombre apellido correo')
      .populate('cursosIds', 'nombre codigoCurso');

    res.json({ message: "Evento cancelado exitosamente", evento: eventoCancelado });
  } catch (error) {
    console.error('Error al cancelar evento:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Eventos del día
export const getEventosHoy = async (req, res) => {
  try {
    const { userId, rol, institucionId } = req.user;

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
    } else if (rol === 'administrador') {
      const cursosDeLaInstitucion = await Curso.find({ institucionId }).distinct('_id');
      filter.cursosIds = { $in: cursosDeLaInstitucion };
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