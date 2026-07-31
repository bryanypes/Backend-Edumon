import express from 'express';
import multer from 'multer';
import { 
  createTarea, 
  getTareas, 
  getTareaById,
  updateTarea,
  closeTarea,
  deleteTarea 
} from '../controllers/tareaController.js';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import { 
  createTareaValidator, 
  updateTareaValidator,
  tareaIdValidator 
} from '../middlewares/validators/tareaValidator.js';
import { normalizeMultipartArrays } from '../middlewares/normalizeMultipartArrays.js';
import { 
  canViewTarea, 
  canModifyTarea,
  filterTareasForUser 
} from '../middlewares/tareaAuthMiddleware.js';

const router = express.Router();

// Configuración de Multer para archivos en memoria
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    // 10MB: límite real del plan de Cloudinary actual para imágenes y archivos
    // "raw" (PDF/Word/Excel/etc). Un límite más alto aquí deja pasar archivos
    // que luego Cloudinary rechaza, y como createTarea/updateTarea suben todos
    // los archivos con Promise.all, un solo archivo grande tumbaba la tarea entera.
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10
  }
});

// Rutas

// Crear tarea - Solo docentes/administradores pueden crear.
// createTarea no validaba el rol (a diferencia de cursoRoutes/foroRoutes), así que
// cualquier usuario autenticado, incluido un padre, podía crear tareas.
router.post(
  '/',
  authMiddleware,
  requireRole(['administrador', 'docente']),
  upload.array('archivos', 10),
  normalizeMultipartArrays(['enlaces', 'participantesSeleccionados', 'etiquetas', 'criterios']),
  createTareaValidator,
  createTarea
);

// Listar tareas - Con filtrado automático según usuario
router.get(
  '/', 
  authMiddleware, 
  filterTareasForUser,
  getTareas
);

// Ver tarea específica - Verifica permisos de visualización
router.get(
  '/:id', 
  authMiddleware, 
  tareaIdValidator,
  canViewTarea, // MIDDLEWARE DE VALIDACIÓN
  getTareaById
);

// Actualizar tarea - Solo el docente asignado
router.put(
  '/:id', 
  authMiddleware, 
  upload.array('archivos', 10),
  normalizeMultipartArrays(['nuevosEnlaces', 'participantesSeleccionados', 'etiquetas', 'archivosAEliminar', 'criterios']),
  tareaIdValidator, 
  canModifyTarea, // MIDDLEWARE DE VALIDACIÓN
  updateTareaValidator, 
  updateTarea
);

// Cerrar tarea - Solo el docente asignado
router.patch(
  '/:id/close', 
  authMiddleware, 
  tareaIdValidator,
  canModifyTarea, // MIDDLEWARE DE VALIDACIÓN
  closeTarea
);

// Eliminar tarea - Solo el docente asignado
router.delete(
  '/:id', 
  authMiddleware, 
  tareaIdValidator,
  canModifyTarea, // MIDDLEWARE DE VALIDACIÓN
  deleteTarea
);

// Manejo de errores de multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'El archivo es demasiado grande. Máximo 10MB por archivo.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'Demasiados archivos. Máximo 10 archivos por petición.'
      });
    }
    return res.status(400).json({
      message: 'Error al subir archivos',
      error: error.message
    });
  }
  next(error);
});

export default router;