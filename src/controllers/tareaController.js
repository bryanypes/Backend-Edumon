import Tarea from '../models/Tarea.js';
import Curso from '../models/Curso.js';
import { validationResult } from 'express-validator';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';

// Determina el resource_type de Cloudinary a partir del formato guardado en el adjunto
function resourceTypeDeFormato(formato) {
  const IMAGENES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  const VIDEOS = ['mp4', 'mpeg', 'mov', 'avi', 'webm'];
  const ext = (formato || '').toLowerCase();
  if (IMAGENES.includes(ext)) return 'image';
  if (VIDEOS.includes(ext)) return 'video';
  return 'raw';
}

// Con multipart/form-data (FormData), cualquier array armado en el cliente con
// JSON.stringify() llega a req.body como STRING, no como array real —
// Array.isArray() sobre ese string siempre da false, así que el campo se
// ignoraba en silencio (o, si se intentaba usar .filter()/.map() sobre él,
// tronaba con "filter is not a function"). Esto normaliza ambos casos.
function parseJSONArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Crear tarea
export const createTarea = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    // El docente de la tarea es siempre el usuario autenticado, nunca el del body
    // (evita que cualquier usuario cree tareas suplantando a otro docente)
    req.body.docenteId = req.user.userId;

    // FormData manda esto como string JSON — normalizar antes de usarlo
    req.body.participantesSeleccionados = parseJSONArray(req.body.participantesSeleccionados);

    // Validar que los participantes seleccionados pertenezcan al curso
    if (req.body.asignacionTipo === 'seleccionados' &&
      req.body.participantesSeleccionados?.length > 0) {

      const curso = await Curso.findById(req.body.cursoId);

      if (!curso) {
        return res.status(404).json({
          message: "Curso no encontrado"
        });
      }

      const participantesInvalidos = req.body.participantesSeleccionados.filter(
        participanteId => !curso.esParticipante(participanteId)
      );

      if (participantesInvalidos.length > 0) {
        return res.status(400).json({
          message: "Algunos participantes seleccionados no pertenecen al curso",
          participantesInvalidos
        });
      }
    }

    if (req.body.asignacionTipo === 'todos') {
      req.body.participantesSeleccionados = [];
    }

    const archivosAdjuntos = [];

    if (req.files && req.files.length > 0) {
      const subidos = await Promise.all(req.files.map(file =>
        subirArchivoCloudinary(file.buffer, file.mimetype, 'archivos-adjuntos-tareas', file.originalname)
          .then(resultado => ({
            tipo: 'archivo',
            url: resultado.url,
            publicId: resultado.publicId,
            nombre: file.originalname,
            formato: resultado.format,
            tamano: file.size
          }))
      ));
      archivosAdjuntos.push(...subidos);
    }

    for (const enlace of parseJSONArray(req.body.enlaces)) {
      archivosAdjuntos.push({
        tipo: 'enlace',
        url: enlace.url,
        nombre: enlace.nombre || 'Enlace',
        descripcion: enlace.descripcion || ''
      });
    }

    req.body.archivosAdjuntos = archivosAdjuntos;

    const newTarea = new Tarea(req.body);
    let savedTarea;
    try {
      savedTarea = await newTarea.save();
    } catch (saveError) {
      // La tarea no se creó: limpiar los archivos que ya se subieron a Cloudinary
      await Promise.all(
        archivosAdjuntos
          .filter(a => a.tipo === 'archivo' && a.publicId)
          .map(a => eliminarArchivoCloudinary(a.publicId, resourceTypeDeFormato(a.formato)))
      );
      throw saveError;
    }

    await savedTarea.populate([
      { path: 'docenteId', select: 'nombre apellido' },
      {
        path: 'cursoId',
        select: 'nombre nivel participantes',
        populate: {
          path: 'participantes.usuarioId',
          select: 'nombre apellido correo'
        }
      },
      { path: 'moduloId', select: 'titulo' },
      { path: 'participantesSeleccionados', select: 'nombre apellido correo' }
    ]);

    eventBus.publicar(EVENTOS.TAREA_CREADA, savedTarea);

    res.status(201).json({
      message: "Tarea creada exitosamente",
      tarea: savedTarea
    });
  } catch (error) {
    console.error('Error al crear tarea:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Listar tareas con paginación, filtros y permisos
export const getTareas = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // máximo 50
    const skip = (page - 1) * limit;
    const { cursoId, moduloId, docenteId, estado, asignacionTipo } = req.query;

    const userId = req.user.userId;
    const userRole = req.user.rol;

    const filter = {};

    if (cursoId) filter.cursoId = cursoId;
    if (moduloId) filter.moduloId = moduloId;
    if (docenteId) filter.docenteId = docenteId;
    if (estado) filter.estado = estado;
    if (asignacionTipo) filter.asignacionTipo = asignacionTipo;

    // Docentes solo ven sus propias tareas; estudiantes/padres solo las de sus cursos
    if (userRole === 'docente') {
      filter.docenteId = userId;
    }
    else if (userRole === 'estudiante' || userRole === 'padre') {
      const cursosDelUsuario = await Curso.find({
        'participantes.usuarioId': userId
      }).select('_id');

      const cursoIds = cursosDelUsuario.map(c => c._id);

      if (cursoIds.length === 0) {
        // Si no está en ningún curso, solo ver tareas asignadas directamente
        filter.asignacionTipo = 'seleccionados';
        filter.participantesSeleccionados = userId;
      } else {
        filter.$or = [
          {
            asignacionTipo: 'todos',
            cursoId: { $in: cursoIds }
          },
          {
            asignacionTipo: 'seleccionados',
            participantesSeleccionados: userId
          }
        ];
      }
    }

    const [tareas, total] = await Promise.all([
      Tarea.find(filter)
        .populate('docenteId', 'nombre apellido')
        .populate({
          path: 'cursoId',
          select: 'nombre nivel participantes',
          populate: {
            path: 'participantes.usuarioId',
            select: 'nombre apellido correo'
          }
        })
        .populate('moduloId', 'titulo')
        .populate('participantesSeleccionados', 'nombre apellido correo')
        .skip(skip)
        .limit(limit)
        .sort({ fechaEntrega: -1 }),
      Tarea.countDocuments(filter)
    ]);

    res.json({
      tareas,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalTareas: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener tareas:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obtener tarea por ID
export const getTareaById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const tarea = await Tarea.findById(req.params.id)
      .populate('docenteId', 'nombre apellido correo')
      .populate({
        path: 'cursoId',
        select: 'nombre nivel participantes',
        populate: {
          path: 'participantes.usuarioId',
          select: 'nombre apellido correo'
        }
      })
      .populate('moduloId', 'titulo descripcion')
      .populate('participantesSeleccionados', 'nombre apellido correo');

    if (!tarea) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    res.json(tarea);
  } catch (error) {
    console.error('Error al obtener tarea:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Actualizar tarea
export const updateTarea = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updateData = { ...req.body };

    // Obtener tarea actual
    const tareaActual = await Tarea.findById(id);
    if (!tareaActual) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    let archivosAdjuntos = [...(tareaActual.archivosAdjuntos || [])];

    for (const publicId of parseJSONArray(req.body.archivosAEliminar)) {
      const archivo = archivosAdjuntos.find(a => a.publicId === publicId);
      if (archivo && archivo.publicId) {
        await eliminarArchivoCloudinary(archivo.publicId, resourceTypeDeFormato(archivo.formato));
      }
      archivosAdjuntos = archivosAdjuntos.filter(a => a.publicId !== publicId);
    }

    let nuevosSubidos = [];
    if (req.files && req.files.length > 0) {
      nuevosSubidos = await Promise.all(req.files.map(file =>
        subirArchivoCloudinary(file.buffer, file.mimetype, 'archivos-adjuntos-tareas', file.originalname)
          .then(resultado => ({
            tipo: 'archivo',
            url: resultado.url,
            publicId: resultado.publicId,
            nombre: file.originalname,
            formato: resultado.format,
            tamano: file.size
          }))
      ));
      archivosAdjuntos.push(...nuevosSubidos);
    }

    for (const enlace of parseJSONArray(req.body.nuevosEnlaces)) {
      archivosAdjuntos.push({
        tipo: 'enlace',
        url: enlace.url,
        nombre: enlace.nombre || 'Enlace',
        descripcion: enlace.descripcion || ''
      });
    }

    updateData.archivosAdjuntos = archivosAdjuntos;

    if (updateData.asignacionTipo === 'todos') {
      updateData.participantesSeleccionados = [];
    } else if ('participantesSeleccionados' in updateData) {
      updateData.participantesSeleccionados = parseJSONArray(updateData.participantesSeleccionados);
    }

    let updatedTarea;
    try {
      updatedTarea = await Tarea.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate('docenteId', 'nombre apellido')
        .populate({
          path: 'cursoId',
          select: 'nombre nivel participantes',
          populate: {
            path: 'participantes.usuarioId',
            select: 'nombre apellido correo'
          }
        })
        .populate('moduloId', 'titulo')
        .populate('participantesSeleccionados', 'nombre apellido correo');
    } catch (updateError) {
      // La actualización falló: limpiar los archivos recién subidos a Cloudinary
      await Promise.all(
        nuevosSubidos.map(a => eliminarArchivoCloudinary(a.publicId, resourceTypeDeFormato(a.formato)))
      );
      throw updateError;
    }

    res.json({
      message: "Tarea actualizada exitosamente",
      tarea: updatedTarea
    });
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Cerrar tarea (cambiar estado)
export const closeTarea = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const updatedTarea = await Tarea.findByIdAndUpdate(
      id,
      { estado: 'cerrada' },
      { new: true }
    );

    if (!updatedTarea) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    eventBus.publicar(EVENTOS.TAREA_CERRADA, updatedTarea);

    res.json({
      message: "Tarea cerrada exitosamente",
      tarea: updatedTarea
    });
  } catch (error) {
    console.error('Error al cerrar tarea:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Eliminar tarea (soft delete)
export const deleteTarea = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const tarea = await Tarea.findById(id);
    if (!tarea) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    const archivos = (tarea.archivosAdjuntos || []).filter(a => a.tipo === 'archivo' && a.publicId);
    if (archivos.length > 0) {
      await Promise.all(
        archivos.map(archivo => eliminarArchivoCloudinary(archivo.publicId, resourceTypeDeFormato(archivo.formato)))
      );
    }

    // Los archivos ya fueron borrados de Cloudinary: limpiar también las referencias
    // en el documento para no dejar enlaces rotos en archivosAdjuntos
    const updatedTarea = await Tarea.findByIdAndUpdate(
      id,
      { estado: 'cerrada', archivosAdjuntos: (tarea.archivosAdjuntos || []).filter(a => a.tipo !== 'archivo') },
      { new: true }
    );

    res.json({
      message: "Tarea eliminada exitosamente",
      tarea: updatedTarea
    });
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};