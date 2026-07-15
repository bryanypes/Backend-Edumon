import Tarea from '../models/Tarea.js';

/**
 * Middleware para verificar si un usuario puede ver una tarea específica
 * Permite acceso a:
 * - Docente asignado a la tarea
 * - Participantes seleccionados (si asignacionTipo es "seleccionados")
 * - Todos los participantes del curso (si asignacionTipo es "todos")
 */
export const canViewTarea = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const tarea = await Tarea.findById(id)
      .populate('cursoId', 'participantes')
      .populate('docenteId', '_id')
      .lean();

    if (!tarea) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    // 1. Si es el docente asignado, tiene acceso total
    if (tarea.docenteId._id.toString() === userId) {
      return next();
    }

    // 2. Si la tarea es para "seleccionados"
    if (tarea.asignacionTipo === 'seleccionados') {
      const isSelected = tarea.participantesSeleccionados.some(
        participante => participante.toString() === userId
      );

      if (!isSelected) {
        return res.status(403).json({
          message: "No tienes permiso para ver esta tarea. Esta tarea está asignada a participantes específicos."
        });
      }
      
      return next();
    }

    // 3. Si la tarea es para "todos", verificar que sea participante del curso
    if (tarea.asignacionTipo === 'todos') {
      const isParticipante = tarea.cursoId.participantes.some(
        p => p.usuarioId.toString() === userId
      );

      if (!isParticipante) {
        return res.status(403).json({
          message: "No tienes permiso para ver esta tarea. No eres participante del curso."
        });
      }
      
      return next();
    }

    // Si no cumple ninguna condición, denegar acceso
    return res.status(403).json({
      message: "No tienes permiso para ver esta tarea"
    });

  } catch (error) {
    console.error('Error en canViewTarea:', error);
    return res.status(500).json({
      message: "Error al verificar permisos"
    });
  }
};

/**
 * Middleware para verificar si un usuario puede modificar/eliminar una tarea
 * Solo permite al docente asignado
 */
export const canModifyTarea = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const tarea = await Tarea.findById(id).select('docenteId').lean();

    if (!tarea) {
      return res.status(404).json({
        message: "Tarea no encontrada"
      });
    }

    if (tarea.docenteId.toString() !== userId) {
      return res.status(403).json({
        message: "Solo el docente asignado puede modificar esta tarea"
      });
    }

    next();
  } catch (error) {
    console.error('Error en canModifyTarea:', error);
    return res.status(500).json({
      message: "Error al verificar permisos"
    });
  }
};

/**
 * Middleware para filtrar tareas en el listado según el usuario
 * Modifica el query para mostrar solo las tareas que el usuario puede ver
 */
export const filterTareasForUser = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.rol; // Asumiendo que el rol está en el token

    // Si es admin, ver todo (opcional)
    if (userRole === 'admin') {
      return next();
    }

    // Si es docente, puede ver todas sus tareas
    if (userRole === 'docente') {
      // Agregar filtro adicional para solo sus tareas (opcional)
      // req.query.docenteId = userId;
      return next();
    }

    // Para estudiantes/padres: modificar el query
    // Guardar el userId para usarlo en el controlador
    req.filteredUserId = userId;
    
    next();
  } catch (error) {
    console.error('Error en filterTareasForUser:', error);
    return res.status(500).json({
      message: "Error al filtrar tareas"
    });
  }
};