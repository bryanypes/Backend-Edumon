import Tarea from '../models/Tarea.js';

// acceso: docente asignado, o participante del curso/seleccionados según asignacionTipo
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

    if (tarea.docenteId._id.toString() === userId) {
      return next();
    }

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

// solo el docente asignado puede modificar/eliminar
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

export const filterTareasForUser = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.rol;

    // admin/superadmin se filtran por institución directo en getTareas
    if (userRole === 'docente') {
      return next();
    }

    req.filteredUserId = userId;

    next();
  } catch (error) {
    console.error('Error en filterTareasForUser:', error);
    return res.status(500).json({
      message: "Error al filtrar tareas"
    });
  }
};