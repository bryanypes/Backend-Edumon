import Tarea from '../models/Tarea.js';
import { validationResult } from 'express-validator';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';

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

    // VALIDAR QUE LOS PARTICIPANTES SELECCIONADOS PERTENEZCAN AL CURSO
    if (req.body.asignacionTipo === 'seleccionados' && 
        req.body.participantesSeleccionados?.length > 0) {
      
      const Curso = (await import('../models/Curso.js')).default;
      const curso = await Curso.findById(req.body.cursoId);
      
      if (!curso) {
        return res.status(404).json({
          message: "Curso no encontrado"
        });
      }

      const participantesInvalidos = [];
      for (const participanteId of req.body.participantesSeleccionados) {
        if (!curso.esParticipante(participanteId)) {
          participantesInvalidos.push(participanteId);
        }
      }

      if (participantesInvalidos.length > 0) {
        return res.status(400).json({
          message: "Algunos participantes seleccionados no pertenecen al curso",
          participantesInvalidos
        });
      }
    }

    // Si asignacionTipo es "todos", limpiar participantesSeleccionados
    if (req.body.asignacionTipo === 'todos') {
      req.body.participantesSeleccionados = [];
    }

    // PROCESAR ARCHIVOS ADJUNTOS
    const archivosAdjuntos = [];
    
    // 1. Subir archivos a Cloudinary (si hay)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const resultado = await subirArchivoCloudinary(
          file.buffer,
          file.mimetype,
          'archivos-adjuntos-tareas',
          file.originalname
        );
        
        archivosAdjuntos.push({
          tipo: 'archivo',
          url: resultado.url,
          publicId: resultado.publicId,
          nombre: file.originalname,
          formato: resultado.format,
          tamano: file.size
        });
      }
    }

    // 2. Agregar enlaces si los hay
    if (req.body.enlaces && Array.isArray(req.body.enlaces)) {
      for (const enlace of req.body.enlaces) {
        archivosAdjuntos.push({
          tipo: 'enlace',
          url: enlace.url,
          nombre: enlace.nombre || 'Enlace',
          descripcion: enlace.descripcion || ''
        });
      }
    }

    // Actualizar el body con los archivos procesados
    req.body.archivosAdjuntos = archivosAdjuntos;

    const newTarea = new Tarea(req.body);
    const savedTarea = await newTarea.save();

    // Popular la tarea guardada
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
    console.log('GET /tareas ejecutado');
    console.log('Usuario ID:', req.user.userId);
    console.log('Rol:', req.user.rol);
    console.log('Query params:', req.query);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { cursoId, moduloId, docenteId, estado, asignacionTipo } = req.query;
    
    const userId = req.user.userId;
    const userRole = req.user.rol;

    const filter = {};
    
    // Filtros básicos opcionales
    if (cursoId) filter.cursoId = cursoId;
    if (moduloId) filter.moduloId = moduloId;
    if (docenteId) filter.docenteId = docenteId;
    if (estado) filter.estado = estado;
    if (asignacionTipo) filter.asignacionTipo = asignacionTipo;

    // FILTRADO SEGÚN ROL Y PERMISOS
    if (userRole === 'docente') {
      // Docentes ven SOLO sus tareas
      filter.docenteId = userId;
      console.log('Filtro docente aplicado');
    } 
    else if (userRole === 'estudiante' || userRole === 'padre') { 
      
      // Obtener cursos donde el usuario participa
      const Curso = (await import('../models/Curso.js')).default;
      const cursosDelUsuario = await Curso.find({
        'participantes.usuarioId': userId
      }).select('_id');
      
      const cursoIds = cursosDelUsuario.map(c => c._id);
      
      console.log('Cursos del usuario:', cursoIds);

      if (cursoIds.length === 0) {
        // Si no está en ningún curso, solo ver tareas asignadas directamente
        filter.asignacionTipo = 'seleccionados';
        filter.participantesSeleccionados = userId;
      } else {
        filter.$or = [
          // Tareas para "todos" en mis cursos
          {
            asignacionTipo: 'todos',
            cursoId: { $in: cursoIds }
          },
          // Tareas donde estoy seleccionado específicamente
          {
            asignacionTipo: 'seleccionados',
            participantesSeleccionados: userId
          }
        ];
      }
    } else {
      console.log(' Usuario admin - sin filtros');
    }

    console.log('Filtro final aplicado:', JSON.stringify(filter, null, 2));

    // Contar todas las tareas sin filtro (para debug)
    const totalSinFiltro = await Tarea.countDocuments({});
    console.log('Total tareas en DB (sin filtro):', totalSinFiltro);

    const tareas = await Tarea.find(filter)
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
      .sort({ fechaEntrega: -1 });

    const total = await Tarea.countDocuments(filter);
    
    console.log('Tareas encontradas con filtro:', tareas.length);
    console.log('Total con filtro:', total);

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

    // PROCESAR NUEVOS ARCHIVOS ADJUNTOS
    let archivosAdjuntos = [...(tareaActual.archivosAdjuntos || [])];

    // 1. Eliminar archivos si se especifican
    if (req.body.archivosAEliminar && Array.isArray(req.body.archivosAEliminar)) {
      for (const publicId of req.body.archivosAEliminar) {
        // Eliminar de Cloudinary
        const archivo = archivosAdjuntos.find(a => a.publicId === publicId);
        if (archivo && archivo.publicId) {
          await eliminarArchivoCloudinary(archivo.publicId, 'raw');
        }
        // Eliminar del array
        archivosAdjuntos = archivosAdjuntos.filter(a => a.publicId !== publicId);
      }
    }

    // 2. Agregar nuevos archivos
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const resultado = await subirArchivoCloudinary(
          file.buffer,
          file.mimetype,
          'archivos-adjuntos-tareas',
          file.originalname
        );
        
        archivosAdjuntos.push({
          tipo: 'archivo',
          url: resultado.url,
          publicId: resultado.publicId,
          nombre: file.originalname,
          formato: resultado.format,
          tamano: file.size
        });
      }
    }

    // 3. Agregar nuevos enlaces
    if (req.body.nuevosEnlaces && Array.isArray(req.body.nuevosEnlaces)) {
      for (const enlace of req.body.nuevosEnlaces) {
        archivosAdjuntos.push({
          tipo: 'enlace',
          url: enlace.url,
          nombre: enlace.nombre || 'Enlace',
          descripcion: enlace.descripcion || ''
        });
      }
    }

    updateData.archivosAdjuntos = archivosAdjuntos;

    // Si cambian a "todos", limpiar participantes
    if (updateData.asignacionTipo === 'todos') {
      updateData.participantesSeleccionados = [];
    }

    const updatedTarea = await Tarea.findByIdAndUpdate(
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

    // Obtener tarea para eliminar archivos de Cloudinary
    const tarea = await Tarea.findById(id);
    if (!tarea) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    // Eliminar archivos de Cloudinary
    if (tarea.archivosAdjuntos && tarea.archivosAdjuntos.length > 0) {
      for (const archivo of tarea.archivosAdjuntos) {
        if (archivo.tipo === 'archivo' && archivo.publicId) {
          await eliminarArchivoCloudinary(archivo.publicId, 'raw');
        }
      }
    }

    const updatedTarea = await Tarea.findByIdAndUpdate(
      id,
      { estado: 'cerrada' },
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