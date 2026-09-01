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
    fileSize: 10 * 1024 * 1024, // límite del plan de Cloudinary; con Promise.all, un archivo grande tumbaba toda la tarea
    files: 10
  }
});

router.post(
  '/',
  authMiddleware,
  requireRole(['administrador', 'docente']),
  upload.array('archivos', 10),
  normalizeMultipartArrays(['enlaces', 'participantesSeleccionados', 'etiquetas', 'criterios']),
  createTareaValidator,
  createTarea
);

router.get(
  '/',
  authMiddleware,
  filterTareasForUser,
  getTareas
);

router.get(
  '/:id',
  authMiddleware,
  tareaIdValidator,
  canViewTarea,
  getTareaById
);

router.put(
  '/:id',
  authMiddleware,
  upload.array('archivos', 10),
  normalizeMultipartArrays(['nuevosEnlaces', 'participantesSeleccionados', 'etiquetas', 'archivosAEliminar', 'criterios']),
  tareaIdValidator,
  canModifyTarea,
  updateTareaValidator,
  updateTarea
);

router.patch(
  '/:id/close',
  authMiddleware,
  tareaIdValidator,
  canModifyTarea,
  closeTarea
);

router.delete(
  '/:id',
  authMiddleware,
  tareaIdValidator,
  canModifyTarea,
  deleteTarea
);

// errores de multer
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