import Entrega from '../models/Entrega.js';
import Tarea from '../models/Tarea.js';
import Curso from '../models/Curso.js';
import { validationResult } from 'express-validator';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { getFileBuffer } from '../utils/fileUploadHelper.js';

// Crear entrega
export const createEntrega = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { tareaId, padreId } = req.body;

    const [existingEntrega, tarea] = await Promise.all([
      Entrega.findOne({ tareaId, padreId }),
      Tarea.findById(tareaId)
    ]);

    if (existingEntrega) {
      return res.status(409).json({ message: "Ya existe una entrega para esta tarea" });
    }

    if (!tarea) {
      return res.status(404).json({ message: "Tarea no encontrada" });
    }

    if (tarea.estado === 'cerrada') {
      return res.status(400).json({ message: "La tarea está cerrada y no acepta entregas" });
    }

    let estado = req.body.estado || 'borrador';
    if (estado === 'enviada' && new Date() > tarea.fechaEntrega) {
      estado = 'tarde';
    }

    // Si un archivo falla al subir, se omite y se registra el error, pero no se aborta la entrega completa
    let archivosAdjuntos = [];
    if (req.files && req.files.length > 0) {
      const resultados = await Promise.allSettled(req.files.map(async (file) => {
        const fileBuffer = await getFileBuffer(file);
        if (!fileBuffer) {
          throw new Error(`No se pudo leer el archivo ${file.originalname}`);
        }

        const archivoSubido = await subirArchivoCloudinary(fileBuffer, file.mimetype, 'archivos-entregas', file.originalname);
        return {
          url: archivoSubido.url,
          publicId: archivoSubido.publicId,
          nombreOriginal: file.originalname,
          tipoArchivo: file.mimetype,
          tamano: file.size
        };
      }));

      resultados.forEach((resultado, i) => {
        if (resultado.status === 'fulfilled') {
          archivosAdjuntos.push(resultado.value);
        } else {
          console.error(`Error subiendo ${req.files[i].originalname}:`, resultado.reason);
        }
      });
    }

    const newEntrega = new Entrega({
      tareaId,
      padreId,
      textoRespuesta: req.body.textoRespuesta,
      estado,
      archivosAdjuntos,
      ...(estado === 'enviada' || estado === 'tarde' ? { fechaEntrega: new Date() } : {})
    });

    let savedEntrega;
    try {
      savedEntrega = await newEntrega.save();
    } catch (saveError) {
      // La entrega no se creó: limpiar los archivos que ya se subieron a Cloudinary
      await Promise.all(archivosAdjuntos.map(a => {
        let resourceType = 'raw';
        if (a.tipoArchivo.startsWith('image/')) resourceType = 'image';
        else if (a.tipoArchivo.startsWith('video/')) resourceType = 'video';
        return eliminarArchivoCloudinary(a.publicId, resourceType);
      }));
      throw saveError;
    }

    if (estado === 'enviada' || estado === 'tarde') {
      const entregaCompleta = await Entrega.findById(savedEntrega._id)
        .populate({
          path: 'tareaId',
          select: 'titulo descripcion fechaEntrega docenteId',
          populate: { path: 'docenteId', select: 'nombre apellido correo rol telefono' }
        })
        .populate({ path: 'padreId', select: 'nombre apellido correo telefono rol' });

      if (!entregaCompleta.tareaId?.docenteId) {
        return res.status(400).json({ message: "Error: La tarea no tiene docente asignado" });
      }

      eventBus.publicar(EVENTOS.ENTREGA_CREADA, {
        entrega: entregaCompleta,
        tarea: entregaCompleta.tareaId,
        padre: entregaCompleta.padreId
      });

      return res.status(201).json({
        message: "Entrega creada y enviada exitosamente",
        entrega: entregaCompleta
      });
    }

    await savedEntrega.populate([
      { path: 'tareaId', select: 'titulo descripcion fechaEntrega' },
      { path: 'padreId', select: 'nombre apellido correo' }
    ]);

    res.status(201).json({ message: "Entrega creada exitosamente", entrega: savedEntrega });

  } catch (error) {
    console.error('Error al crear entrega:', error);
    // Índice único (tareaId, padreId): puede dispararse si dos solicitudes concurrentes
    // pasaron la verificación de duplicado antes de que la primera terminara de guardar
    if (error.code === 11000) {
      return res.status(409).json({ message: "Ya existe una entrega para esta tarea" });
    }
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Listar entregas del padre por tarea
export const getEntregasByPadreAndTarea = async (req, res) => {
  try {
    const { tareaId } = req.params;
    const padreId = req.user.userId;

    const entregas = await Entrega.find({ tareaId, padreId })
      .populate('tareaId', 'titulo descripcion fechaEntrega criterios')
      .populate('padreId', 'nombre apellido correo')
      .populate('calificacion.docenteId', 'nombre apellido correo')
      .sort({ createdAt: -1 });

    res.json({ entregas, total: entregas.length });
  } catch (error) {
    console.error('Error al obtener entregas del padre:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Actualizar entrega (solo en borrador)
export const updateEntrega = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.calificacion;
    delete updateData.tareaId;
    delete updateData.padreId;

    const entrega = await Entrega.findById(id).populate('tareaId');
    if (!entrega) {
      return res.status(404).json({ message: "Entrega no encontrada" });
    }

    let nuevosSubidos = [];
    if (req.files && req.files.length > 0) {
      nuevosSubidos = await Promise.all(req.files.map(async (file) => {
        const fileBuffer = await getFileBuffer(file);
        if (!fileBuffer) {
          throw new Error(`No se pudo leer el archivo ${file.originalname}`);
        }

        const archivoSubido = await subirArchivoCloudinary(fileBuffer, file.mimetype, 'archivos-entregas', file.originalname);
        return {
          url: archivoSubido.url,
          publicId: archivoSubido.publicId,
          nombreOriginal: file.originalname,
          tipoArchivo: file.mimetype,
          tamano: file.size
        };
      }));
      updateData.archivosAdjuntos = [...(entrega.archivosAdjuntos || []), ...nuevosSubidos];
    }

    if (updateData.estado === 'enviada' && new Date() > entrega.tareaId.fechaEntrega) {
      updateData.estado = 'tarde';
    }

    let updatedEntrega;
    try {
      updatedEntrega = await Entrega.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
        .populate('tareaId', 'titulo fechaEntrega')
        .populate('padreId', 'nombre apellido correo');
    } catch (updateError) {
      await Promise.all(nuevosSubidos.map(a => {
        let resourceType = 'raw';
        if (a.tipoArchivo.startsWith('image/')) resourceType = 'image';
        else if (a.tipoArchivo.startsWith('video/')) resourceType = 'video';
        return eliminarArchivoCloudinary(a.publicId, resourceType);
      }));
      throw updateError;
    }

    res.json({ message: "Entrega actualizada exitosamente", entrega: updatedEntrega });
  } catch (error) {
    console.error('Error al actualizar entrega:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Enviar entrega (borrador → enviada/tarde)
export const enviarEntrega = async (req, res) => {
  try {
    const { id } = req.params;
    const entrega = await Entrega.findById(id).populate('tareaId');

    if (!entrega) return res.status(404).json({ message: "Entrega no encontrada" });

    if (entrega.estado !== 'borrador') {
      return res.status(400).json({ message: "Solo se pueden enviar entregas en estado borrador" });
    }

    if (entrega.tareaId.estado === 'cerrada') {
      return res.status(400).json({ message: "La tarea está cerrada y no acepta entregas" });
    }

    const estado = new Date() > entrega.tareaId.fechaEntrega ? 'tarde' : 'enviada';
    entrega.estado = estado;
    entrega.fechaEntrega = new Date();
    await entrega.save();

    const entregaCompleta = await Entrega.findById(id)
      .populate({
        path: 'tareaId',
        select: 'titulo descripcion fechaEntrega docenteId',
        populate: { path: 'docenteId', select: 'nombre apellido correo rol telefono' }
      })
      .populate({ path: 'padreId', select: 'nombre apellido correo telefono' });

    if (!entregaCompleta.tareaId.docenteId) {
      return res.status(400).json({ message: "Error: La tarea no tiene docente asignado" });
    }

    eventBus.publicar(EVENTOS.ENTREGA_CREADA, {
      entrega: entregaCompleta,
      tarea: entregaCompleta.tareaId,
      padre: entregaCompleta.padreId
    });

    res.json({
      message: `Entrega ${estado === 'tarde' ? 'enviada con retraso' : 'enviada exitosamente'}`,
      entrega: entregaCompleta
    });
  } catch (error) {
    console.error('Error al enviar entrega:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Eliminar entrega (solo en borrador)
export const deleteEntrega = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const entrega = await Entrega.findById(id);

    if (!entrega) return res.status(404).json({ message: "Entrega no encontrada" });

    if (entrega.estado !== 'borrador') {
      return res.status(400).json({ message: "Solo se pueden eliminar entregas en borrador" });
    }

    if (entrega.archivosAdjuntos && entrega.archivosAdjuntos.length > 0) {
      for (const archivo of entrega.archivosAdjuntos) {
        let resourceType = 'raw';
        if (archivo.tipoArchivo.startsWith('image/')) resourceType = 'image';
        else if (archivo.tipoArchivo.startsWith('video/')) resourceType = 'video';
        await eliminarArchivoCloudinary(archivo.publicId, resourceType);
      }
    }

    await Entrega.findByIdAndDelete(id);
    res.json({ message: "Entrega eliminada exitosamente" });
  } catch (error) {
    console.error('Error al eliminar entrega:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Eliminar archivo específico de una entrega
export const eliminarArchivoEntrega = async (req, res) => {
  try {
    const { id, archivoId } = req.params;
    const entrega = await Entrega.findById(id);

    if (!entrega) return res.status(404).json({ message: "Entrega no encontrada" });

    if (entrega.estado !== 'borrador') {
      return res.status(400).json({ message: "Solo se pueden eliminar archivos de entregas en borrador" });
    }

    const archivoIndex = entrega.archivosAdjuntos.findIndex(
      archivo => archivo._id.toString() === archivoId
    );

    if (archivoIndex === -1) return res.status(404).json({ message: "Archivo no encontrado" });

    const archivo = entrega.archivosAdjuntos[archivoIndex];
    let resourceType = 'raw';
    if (archivo.tipoArchivo.startsWith('image/')) resourceType = 'image';
    else if (archivo.tipoArchivo.startsWith('video/')) resourceType = 'video';

    await eliminarArchivoCloudinary(archivo.publicId, resourceType);
    entrega.archivosAdjuntos.splice(archivoIndex, 1);
    await entrega.save();

    res.json({ message: "Archivo eliminado exitosamente", entrega });
  } catch (error) {
    console.error('Error al eliminar archivo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Listar todas las entregas
export const getAllEntregas = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const { estado } = req.query;
    const { rol: userRole, institucionId } = req.user;

    const filter = { estado: { $in: ['enviada', 'tarde'] } };
    if (estado && (estado === 'enviada' || estado === 'tarde')) filter.estado = estado;

    if (userRole === 'docente') {
      filter.tareaId = { $in: req.docenteTareaIds?.length ? req.docenteTareaIds : [] };
    } else if (userRole === 'padre') {
      // Un padre solo debe ver sus propias entregas, nunca las de otros padres
      filter.padreId = req.user.userId;
    } else if (userRole === 'administrador') {
      // Sin este filtro, un administrador veía entregas (y calificaciones) de
      // TODAS las instituciones de la plataforma, igual que pasaba antes en
      // cursos/eventos/foros antes de acotarlos por institución.
      const cursosDeLaInstitucion = await Curso.find({ institucionId }).select('_id');
      const tareasDeLaInstitucion = await Tarea.find({
        cursoId: { $in: cursosDeLaInstitucion.map((c) => c._id) }
      }).select('_id');
      filter.tareaId = { $in: tareasDeLaInstitucion.map((t) => t._id) };
    }

    const [entregas, total] = await Promise.all([
      Entrega.find(filter)
        .populate('tareaId', 'titulo descripcion fechaEntrega')
        .populate('padreId', 'nombre apellido correo')
        .populate('calificacion.docenteId', 'nombre apellido')
        .skip(skip).limit(limit).sort({ fechaEntrega: -1 }),
      Entrega.countDocuments(filter)
    ]);

    res.json({
      entregas,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalEntregas: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener entregas:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Listar entregas de una tarea específica
export const getEntregasByTarea = async (req, res) => {
  try {
    const { tareaId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const { estado } = req.query;

    const tarea = await Tarea.findById(tareaId);
    if (!tarea) return res.status(404).json({ message: "Tarea no encontrada" });

    // La ruta solo exige rol docente/administrador, pero no verificaba que la
    // tarea perteneciera a ESE docente o a la institución de ESE administrador
    // — cualquier docente/admin autenticado podía leer entregas y
    // calificaciones de una tarea ajena con solo conocer el tareaId.
    const { userId, rol, institucionId } = req.user;
    if (rol === 'docente' && tarea.docenteId.toString() !== userId) {
      return res.status(403).json({ message: "No tienes permisos para ver las entregas de esta tarea" });
    }
    if (rol === 'administrador') {
      const curso = await Curso.findById(tarea.cursoId).select('institucionId');
      if (!curso || curso.institucionId.toString() !== institucionId) {
        return res.status(403).json({ message: "No tienes permisos para ver las entregas de esta tarea" });
      }
    }

    const filter = { tareaId, estado: { $in: ['enviada', 'tarde'] } };
    if (estado && (estado === 'enviada' || estado === 'tarde')) filter.estado = estado;

    const [entregas, total, enviadas, tarde, valoradas] = await Promise.all([
      Entrega.find(filter)
        .populate('padreId', 'nombre apellido correo telefono')
        .populate('calificacion.docenteId', 'nombre apellido')
        .skip(skip).limit(limit).sort({ fechaEntrega: -1 }),
      Entrega.countDocuments(filter),
      Entrega.countDocuments({ tareaId, estado: 'enviada' }),
      Entrega.countDocuments({ tareaId, estado: 'tarde' }),
      Entrega.countDocuments({
        tareaId,
        estado: { $in: ['enviada', 'tarde'] },
        'calificacion.valoracion': { $exists: true, $ne: null }
      })
    ]);

    const stats = { total, enviadas, tarde, valoradas };

    res.json({
      tarea: { id: tarea._id, titulo: tarea.titulo, fechaEntrega: tarea.fechaEntrega },
      entregas,
      estadisticas: stats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalEntregas: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener entregas por tarea:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Listar entregas de un padre
export const getEntregasByPadre = async (req, res) => {
  try {
    const { padreId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const { estado } = req.query;

    // Igual que en getEntregasByTarea: la ruta solo exige rol docente/administrador,
    // sin verificar que el padre consultado comparta curso/institución con quien
    // consulta — cualquier docente o admin podía leer las entregas de un padre
    // de otro curso/colegio con solo conocer su padreId.
    const { userId, rol, institucionId } = req.user;
    if (rol === 'docente') {
      const compartenCurso = await Curso.exists({ docenteId: userId, 'participantes.usuarioId': padreId });
      if (!compartenCurso) {
        return res.status(403).json({ message: "No tienes permisos para ver las entregas de este padre" });
      }
    } else if (rol === 'administrador') {
      const compartenInstitucion = await Curso.exists({ institucionId, 'participantes.usuarioId': padreId });
      if (!compartenInstitucion) {
        return res.status(403).json({ message: "No tienes permisos para ver las entregas de este padre" });
      }
    }

    const filter = { padreId, estado: { $in: ['enviada', 'tarde'] } };
    if (estado && (estado === 'enviada' || estado === 'tarde')) filter.estado = estado;

    const [entregas, total] = await Promise.all([
      Entrega.find(filter)
        .populate('tareaId', 'titulo descripcion fechaEntrega')
        .populate('calificacion.docenteId', 'nombre apellido')
        .skip(skip).limit(limit).sort({ fechaEntrega: -1 }),
      Entrega.countDocuments(filter)
    ]);

    res.json({
      entregas,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalEntregas: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener entregas por padre:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Valorar entrega (1-5 estrellas)
 * CORRECCIÓN: docenteId se extrae de req.user.userId — nunca del body.
 */
export const calificarEntrega = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { id } = req.params;
    const { valoracion, comentario } = req.body;

    // CORRECCIÓN CRÍTICA: docenteId desde el token, no del body
    const docenteId = req.user.userId;

    const entrega = await Entrega.findById(id);
    if (!entrega) return res.status(404).json({ message: "Entrega no encontrada" });

    if (entrega.estado === 'borrador') {
      return res.status(400).json({ message: "No se puede valorar una entrega en borrador" });
    }

    const valoracionInt = parseInt(valoracion);
    const esActualizacion = entrega.calificacion?.valoracion !== undefined &&
                            entrega.calificacion.valoracion !== null;

    entrega.calificacion = {
      valoracion: valoracionInt,
      comentario: comentario || null,
      fechaCalificacion: esActualizacion ? entrega.calificacion.fechaCalificacion : new Date(),
      docenteId,
      ...(esActualizacion && {
        fechaUltimaModificacion: new Date(),
        valoracionAnterior: entrega.calificacion.valoracion
      })
    };

    await entrega.save();

    const updatedEntrega = await Entrega.findById(id)
      .populate('tareaId', 'titulo')
      .populate('padreId', 'nombre apellido correo')
      .populate('calificacion.docenteId', 'nombre apellido');

    eventBus.publicar(EVENTOS.ENTREGA_CALIFICADA, {
      entrega: updatedEntrega,
      tarea: updatedEntrega.tareaId,
      padre: updatedEntrega.padreId,
      docente: updatedEntrega.calificacion.docenteId
    });

    res.json({
      message: esActualizacion ? "Valoración actualizada exitosamente" : "Entrega valorada exitosamente",
      entrega: updatedEntrega,
      estrellas: updatedEntrega.estrellas,
      esActualizacion
    });
  } catch (error) {
    console.error('Error al valorar entrega:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Obtener entrega por ID
export const getEntregaById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const entrega = await Entrega.findById(req.params.id)
      .populate('tareaId', 'titulo descripcion fechaEntrega criterios')
      .populate('padreId', 'nombre apellido correo telefono')
      .populate('calificacion.docenteId', 'nombre apellido correo');

    if (!entrega) return res.status(404).json({ message: "Entrega no encontrada" });

    res.json(entrega);
  } catch (error) {
    console.error('Error al obtener entrega:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};