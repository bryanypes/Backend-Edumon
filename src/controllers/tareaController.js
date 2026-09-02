import Tarea from '../models/Tarea.js';
import Curso from '../models/Curso.js';
import Modulo from '../models/Modulo.js';
import { validationResult } from 'express-validator';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { getFileBuffer } from '../utils/fileUploadHelper.js';
import { parseJSONArray } from '../utils/parseJSONArray.js';

function resourceTypeDeFormato(formato) {
  const IMAGENES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  const VIDEOS = ['mp4', 'mpeg', 'mov', 'avi', 'webm'];
  const ext = (formato || '').toLowerCase();
  if (IMAGENES.includes(ext)) return 'image';
  if (VIDEOS.includes(ext)) return 'video';
  return 'raw';
}

// mismo criterio que moduloController
function usuarioPerteneceACurso(curso, user) {
  switch (user.rol) {
    case 'superadmin':
      return true;
    case 'administrador':
      return curso.institucionId?.toString() === user.institucionId;
    case 'docente':
      return curso.docenteId?.toString() === user.userId;
    default:
      return false;
  }
}

// Al reasignar curso/módulo en updateTarea hay que revalidar el destino: canModifyTarea
// solo comprueba que seas el docente de la tarea, NO que tengas permiso sobre el curso
// nuevo. Sin esto un docente movía su tarea a un curso ajeno (PUT cursoId) y pasaba a
// poder ver y calificar todas sus entregas — canCalificarEntrega/getEntregasByTarea solo
// miran tarea.docenteId.
async function validarDestinoTarea(tareaActual, body, user) {
  const cursoIdActual = tareaActual.cursoId.toString();
  const cursoIdDestino = body.cursoId ?? cursoIdActual;
  const moduloIdDestino = body.moduloId ?? tareaActual.moduloId.toString();

  if (body.cursoId && body.cursoId !== cursoIdActual) {
    const cursoDestino = await Curso.findById(body.cursoId).select('docenteId institucionId participantes');
    if (!cursoDestino) return { status: 404, message: 'Curso de destino no encontrado' };
    if (!usuarioPerteneceACurso(cursoDestino, user)) {
      return { status: 403, message: 'No tienes permisos sobre el curso de destino' };
    }
  }

  if (body.cursoId || body.moduloId) {
    const modulo = await Modulo.findById(moduloIdDestino).select('cursoId');
    if (!modulo) return { status: 404, message: 'Módulo no encontrado' };
    if (modulo.cursoId.toString() !== cursoIdDestino) {
      return { status: 400, message: 'El módulo no pertenece al curso indicado' };
    }
  }

  return null;
}

// path/msg igual que express-validator: el frontend solo reconoce esas claves
function responderValidationError(res, error) {
  const errores = Object.entries(error.errors).map(([path, err]) => ({
    path,
    msg: err.message
  }));
  return res.status(400).json({
    message: "Errores de validación",
    errors: errores
  });
}

export const createTarea = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    // docenteId siempre del token, nunca del body, para evitar suplantación
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }
    req.body.docenteId = req.user.userId;

    // FormData manda esto como string JSON — normalizar antes de usarlo
    req.body.participantesSeleccionados = parseJSONArray(req.body.participantesSeleccionados);

    // requireRole no valida dueño del curso, solo el rol
    const curso = await Curso.findById(req.body.cursoId).select('docenteId institucionId participantes');

    if (!curso) {
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    if (!usuarioPerteneceACurso(curso, req.user)) {
      return res.status(403).json({
        message: "No tienes permisos sobre este curso"
      });
    }

    // el módulo debe pertenecer al curso indicado (evita tareas "huérfanas" apuntando a otro curso)
    const moduloDelCurso = await Modulo.findById(req.body.moduloId).select('cursoId');
    if (!moduloDelCurso) {
      return res.status(404).json({ message: "Módulo no encontrado" });
    }
    if (moduloDelCurso.cursoId.toString() !== req.body.cursoId.toString()) {
      return res.status(400).json({ message: "El módulo no pertenece al curso indicado" });
    }

    if (req.body.asignacionTipo === 'seleccionados' &&
      req.body.participantesSeleccionados?.length > 0) {

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
      // try/catch propio para devolver un 503 accionable en vez del 500 genérico
      try {
        const subidos = await Promise.all(req.files.map(async (file) => {
          const fileBuffer = await getFileBuffer(file);
          if (!fileBuffer) {
            throw new Error(`No se pudo leer el archivo ${file.originalname}`);
          }

          const resultado = await subirArchivoCloudinary(fileBuffer, file.mimetype, 'archivos-adjuntos-tareas', file.originalname);
          return {
            tipo: 'archivo',
            url: resultado.url,
            publicId: resultado.publicId,
            nombre: file.originalname,
            formato: resultado.format,
            tamano: file.size
          };
        }));
        archivosAdjuntos.push(...subidos);
      } catch (uploadError) {
        console.error('Error al subir archivos adjuntos de la tarea:', uploadError);
        return res.status(503).json({
          message: "No se pudo subir uno de los archivos adjuntos. Verifica tu conexión e intenta de nuevo; si el problema persiste, prueba con un archivo más liviano.",
        });
      }
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

    // docenteId explícito otra vez para que nada en req.body lo pueda pisar
    const newTarea = new Tarea({ ...req.body, docenteId: req.user.userId });
    let savedTarea;
    try {
      savedTarea = await newTarea.save();
    } catch (saveError) {
      // save falló: limpiar lo ya subido a Cloudinary
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
    if (error.name === 'ValidationError') {
      return responderValidationError(res, error);
    }
    console.error('Error al crear tarea:', error);

    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getTareas = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const { cursoId, moduloId, docenteId, estado, asignacionTipo } = req.query;

    const userId = req.user.userId;
    const userRole = req.user.rol;
    const institucionId = req.user.institucionId;

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
    else if (userRole === 'administrador') {
      // limitar a la institución del admin, no toda la plataforma
      const cursosDeLaInstitucion = await Curso.find({ institucionId }).select('_id');
      filter.cursoId = { $in: cursosDeLaInstitucion.map((c) => c._id) };
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
    const updateData = {};

    const tareaActual = await Tarea.findById(id);
    if (!tareaActual) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    const errorDestino = await validarDestinoTarea(tareaActual, req.body, req.user);
    if (errorDestino) {
      return res.status(errorDestino.status).json({ message: errorDestino.message });
    }

    const camposActualizables = [
      'titulo',
      'descripcion',
      'fechaEntrega',
      'tipoEntrega',
      'estado',
      'cursoId',
      'moduloId',
      'asignacionTipo',
      'criterios'
    ];

    for (const campo of camposActualizables) {
      if (Object.prototype.hasOwnProperty.call(req.body, campo)) {
        updateData[campo] = req.body[campo];
      }
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
      // mismo aislamiento que en createTarea
      try {
        nuevosSubidos = await Promise.all(req.files.map(async (file) => {
          const fileBuffer = await getFileBuffer(file);
          if (!fileBuffer) {
            throw new Error(`No se pudo leer el archivo ${file.originalname}`);
          }

          const resultado = await subirArchivoCloudinary(fileBuffer, file.mimetype, 'archivos-adjuntos-tareas', file.originalname);
          return {
            tipo: 'archivo',
            url: resultado.url,
            publicId: resultado.publicId,
            nombre: file.originalname,
            formato: resultado.format,
            tamano: file.size
          };
        }));
        archivosAdjuntos.push(...nuevosSubidos);
      } catch (uploadError) {
        console.error('Error al subir archivos adjuntos de la tarea:', uploadError);
        return res.status(503).json({
          message: "No se pudo subir uno de los archivos adjuntos. Verifica tu conexión e intenta de nuevo; si el problema persiste, prueba con un archivo más liviano.",
        });
      }
    }

    const nuevosEnlaces = req.body.nuevosEnlaces !== undefined
      ? parseJSONArray(req.body.nuevosEnlaces)
      : parseJSONArray(req.body.enlaces);

    for (const enlace of nuevosEnlaces) {
      archivosAdjuntos.push({
        tipo: 'enlace',
        url: enlace.url,
        nombre: enlace.nombre || 'Enlace',
        descripcion: enlace.descripcion || ''
      });
    }

    updateData.archivosAdjuntos = archivosAdjuntos;

    if (req.body.asignacionTipo === 'todos') {
      updateData.participantesSeleccionados = [];
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'participantesSeleccionados')) {
      updateData.participantesSeleccionados = parseJSONArray(req.body.participantesSeleccionados);
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
      // update falló: limpiar lo recién subido a Cloudinary
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
    if (error.name === 'ValidationError') {
      return responderValidationError(res, error);
    }
    console.error('Error al actualizar tarea:', error);

    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

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

    // limpiar referencias a los archivos ya borrados de Cloudinary
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