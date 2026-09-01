import Tarea from '../models/Tarea.js';
import Entrega from '../models/Entrega.js';
import Curso from '../models/Curso.js';

export const canCreateEntrega = async (req, res, next) => {
  try {
    const { tareaId, padreId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado correctamente" });
    }

    if (padreId !== userId) {
      return res.status(403).json({ message: "Solo puedes crear entregas para ti mismo" });
    }

    const tarea = await Tarea.findById(tareaId)
      .populate({
        path: 'cursoId',
        populate: {
          path: 'participantes.usuarioId',
          select: '_id nombre apellido correo'
        }
      })
      .lean();

    if (!tarea) {
      return res.status(404).json({ message: "Tarea no encontrada" });
    }

    if (tarea.asignacionTipo === "seleccionados") {
      const seleccionados = tarea.participantesSeleccionados || [];
      const permitido = seleccionados.some(p => p.toString() === userId);

      if (!permitido) {
        return res.status(403).json({
          message: "No estás autorizado para entregar esta tarea (no estás seleccionado)"
        });
      }
    }

    const participantes = tarea.cursoId?.participantes || [];
    const participanteValido = participantes.some(p =>
      p.usuarioId?._id?.toString() === userId ||
      p.usuarioId?.toString() === userId
    );

    if (!participanteValido) {
      return res.status(403).json({ message: "No estás autorizado para enviar esta entrega" });
    }

    next();

  } catch (error) {
    console.error("Error en canCreateEntrega:", error);
    res.status(500).json({ message: "Error interno al validar la entrega" });
  }
};

// Solo el padre que creó la entrega puede modificarla, y solo en estado "borrador"
export const canModifyEntrega = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const entrega = await Entrega.findById(id).lean();

    if (!entrega) {
      return res.status(404).json({
        message: "Entrega no encontrada"
      });
    }

    if (entrega.padreId.toString() !== userId) {
      return res.status(403).json({
        message: "Solo puedes modificar tus propias entregas"
      });
    }

    // DELETE tiene su propia regla en deleteEntrega/eliminarArchivoEntrega
    if (entrega.estado !== 'borrador' && req.method !== 'DELETE') {
      return res.status(400).json({
        message: "Solo puedes modificar entregas en estado borrador"
      });
    }

    next();

  } catch (error) {
    console.error('Error en canModifyEntrega:', error);
    return res.status(500).json({
      message: "Error al verificar permisos para modificar entrega",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// pueden ver: el padre que creó la entrega, el docente de la tarea, admin/superadmin
export const canViewEntrega = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, rol: userRole, institucionId } = req.user;

    const entrega = await Entrega.findById(id)
      .populate({
        path: 'tareaId',
        select: 'docenteId cursoId'
      })
      .lean();

    if (!entrega) {
      return res.status(404).json({
        message: "Entrega no encontrada"
      });
    }

    if (entrega.padreId.toString() === userId) {
      return next();
    }

    if (entrega.tareaId.docenteId.toString() === userId) {
      return next();
    }

    if (userRole === 'administrador') {
      const curso = await Curso.findById(entrega.tareaId.cursoId).select('institucionId');
      if (curso && curso.institucionId.toString() === institucionId) {
        return next();
      }
    }

    if (userRole === 'superadmin') {
      return next();
    }

    return res.status(403).json({
      message: "No tienes permiso para ver esta entrega"
    });

  } catch (error) {
    console.error('Error en canViewEntrega:', error);
    return res.status(500).json({
      message: "Error al verificar permisos para ver entrega",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// solo el docente asignado a la tarea puede calificar
export const canCalificarEntrega = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const entrega = await Entrega.findById(id)
      .populate({
        path: 'tareaId',
        select: 'docenteId estado'
      })
      .lean();

    if (!entrega) {
      return res.status(404).json({
        message: "Entrega no encontrada"
      });
    }

    if (entrega.tareaId.docenteId.toString() !== userId) {
      return res.status(403).json({
        message: "Solo el docente asignado a la tarea puede calificar entregas"
      });
    }

    next();

  } catch (error) {
    console.error('Error en canCalificarEntrega:', error);
    return res.status(500).json({
      message: "Error al verificar permisos para calificar entrega",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const filterEntregasForUser = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.rol;

    // admin/superadmin se filtran por institución directo en getAllEntregas
    if (userRole === 'docente') {
      const tareas = await Tarea.find({ docenteId: userId }).select('_id').lean();
      const tareaIds = tareas.map(t => t._id);
      req.docenteTareaIds = tareaIds;
    }

    if (userRole === 'padre') {
      req.filteredPadreId = userId;
    }

    next();

  } catch (error) {
    console.error('Error en filterEntregasForUser:', error);
    return res.status(500).json({
      message: "Error al filtrar entregas",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};