import Evento from '../models/Evento.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';

// Crear evento
export const createEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { userId, rol } = req.user;

    // Verificar que el usuario sea administrador o docente
    if (!['administrador', 'docente'].includes(rol)) {
      return res.status(403).json({
        message: "No tienes permisos para crear eventos"
      });
    }

    let { titulo, descripcion, fechaInicio, fechaFin, hora, ubicacion, cursosIds, categoria } = req.body;

    // Si cursosIds viene como string (form-data), parsearlo
    if (typeof cursosIds === 'string') {
      try {
        cursosIds = JSON.parse(cursosIds);
      } catch (error) {
        return res.status(400).json({
          message: "El formato de cursosIds es inválido. Debe ser un array de IDs"
        });
      }
    }

    // Verificar que cursosIds sea un array
    if (!Array.isArray(cursosIds) || cursosIds.length === 0) {
      return res.status(400).json({
        message: "cursosIds debe ser un array con al menos un ID de curso"
      });
    }

    // Verificar que los cursos existan
    const cursosExisten = await Curso.find({ _id: { $in: cursosIds } });
    if (cursosExisten.length !== cursosIds.length) {
      return res.status(404).json({
        message: "Uno o más cursos no existen"
      });
    }

    // Si es docente, verificar que sea el docente de todos los cursos
    if (rol === 'docente') {
      const cursosDelDocente = cursosExisten.filter(
        curso => curso.docenteId.toString() === userId
      );
      
      if (cursosDelDocente.length !== cursosIds.length) {
        return res.status(403).json({
          message: "Solo puedes crear eventos para tus propios cursos"
        });
      }
    }

    // Subir adjunto si existe
    let adjuntoUrl = null;
    if (req.file) {
      const resultado = await subirArchivoCloudinary(
        req.file.buffer,
        req.file.mimetype,
        'eventos-adjuntos'
      );
      adjuntoUrl = resultado.url;
    }

    // Crear evento
    const nuevoEvento = new Evento({
      titulo,
      descripcion,
      fechaInicio,
      fechaFin,
      hora,
      ubicacion,
      docenteId: userId,
      cursosIds,
      categoria,
      adjuntos: adjuntoUrl
    });

    const eventoGuardado = await nuevoEvento.save();

    // Poblar información del evento
    const eventoCompleto = await Evento.findById(eventoGuardado._id)
      .populate('docenteId', 'nombre apellido correo')
      .populate('cursosIds', 'nombre codigoCurso');

    // Enviar notificaciones a todos los participantes
eventBus.publicar(EVENTOS.EVENTO_CREADO, eventoCompleto);

    res.status(201).json({
      message: "Evento creado exitosamente",
      evento: eventoCompleto
    });
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Listar eventos con filtros y paginación
export const getEventos = async (req, res) => {
  try {
    const { userId, rol } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { categoria, estado, cursoId } = req.query;

    // Construir filtro
    const filter = {};
    
    if (categoria) filter.categoria = categoria;
    if (estado) filter.estado = estado;
    if (cursoId) filter.cursosIds = cursoId;

    // Si es docente, solo ver sus eventos
    if (rol === 'docente') {
      filter.docenteId = userId;
    }
    
    // Si es padre, solo ver eventos de sus cursos
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
      .skip(skip)
      .limit(limit)
      .sort({ fechaInicio: -1 });

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
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Obtener evento por ID
export const getEventoById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { userId, rol } = req.user;

    const evento = await Evento.findById(id)
      .populate('docenteId', 'nombre apellido correo')
      .populate({
        path: 'cursosIds',
        select: 'nombre codigoCurso participantes',
        populate: {
          path: 'participantes.usuarioId',
          select: 'nombre apellido correo rol'
        }
      });

    if (!evento) {
      return res.status(404).json({
        message: "Evento no encontrado"
      });
    }

    // Verificar permisos
    if (rol === 'docente' && evento.docenteId._id.toString() !== userId) {
      return res.status(403).json({
        message: "No tienes permiso para ver este evento"
      });
    }

    if (rol === 'padre') {
      const cursosDelPadre = await Curso.find({
        'participantes.usuarioId': userId,
        'participantes.etiqueta': 'padre'
      }).distinct('_id');
      
      const tieneAcceso = evento.cursosIds.some(curso => 
        cursosDelPadre.some(id => id.equals(curso._id))
      );
      
      if (!tieneAcceso) {
        return res.status(403).json({
          message: "No tienes permiso para ver este evento"
        });
      }
    }

    res.json(evento);
  } catch (error) {
    console.error('Error al obtener evento:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Actualizar evento
export const updateEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { userId, rol } = req.user;
    const updateData = { ...req.body };

    const evento = await Evento.findById(id);
    if (!evento) {
      return res.status(404).json({
        message: "Evento no encontrado"
      });
    }

    // Verificar permisos
    if (rol === 'docente' && evento.docenteId.toString() !== userId) {
      return res.status(403).json({
        message: "No tienes permiso para actualizar este evento"
      });
    }

    // No permitir actualizar ciertos campos
    delete updateData._id;
    delete updateData.docenteId;
    delete updateData.fechaCreacion;

    // Si hay nuevo adjunto, eliminar el anterior
    if (req.file) {
      if (evento.adjuntos) {
        const publicIdAnterior = evento.adjuntos.split('/').slice(-2).join('/').split('.')[0];
        await eliminarArchivoCloudinary(publicIdAnterior, 'raw');
      }

      const resultado = await subirArchivoCloudinary(
        req.file.buffer,
        req.file.mimetype,
        'eventos-adjuntos'
      );
      updateData.adjuntos = resultado.url;
    }

    const eventoActualizado = await Evento.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('docenteId', 'nombre apellido correo')
      .populate('cursosIds', 'nombre codigoCurso');

    res.json({
      message: "Evento actualizado exitosamente",
      evento: eventoActualizado
    });
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Eliminar evento
export const deleteEvento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { userId, rol } = req.user;

    const evento = await Evento.findById(id);
    if (!evento) {
      return res.status(404).json({
        message: "Evento no encontrado"
      });
    }

    // Verificar permisos
    if (rol === 'docente' && evento.docenteId.toString() !== userId) {
      return res.status(403).json({
        message: "No tienes permiso para eliminar este evento"
      });
    }

    // Eliminar adjunto de Cloudinary si existe
    if (evento.adjuntos) {
      const publicId = evento.adjuntos.split('/').slice(-2).join('/').split('.')[0];
      await eliminarArchivoCloudinary(publicId, 'raw');
    }

    await Evento.findByIdAndDelete(id);

    res.json({
      message: "Evento eliminado exitosamente"
    });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Obtener eventos del día
export const getEventosHoy = async (req, res) => {
  try {
    const { userId, rol } = req.user;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    const filter = {
      fechaInicio: {
        $gte: hoy,
        $lt: mañana
      }
    };

    // Filtrar según rol
    if (rol === 'docente') {
      filter.docenteId = userId;
    } else if (rol === 'padre') {
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

    res.json({
      eventos,
      total: eventos.length
    });
  } catch (error) {
    console.error('Error al obtener eventos de hoy:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};