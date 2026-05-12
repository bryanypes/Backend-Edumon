import express from 'express';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import {
  crearForo,
  obtenerForosPorCurso,
  obtenerForoPorId,
  actualizarForo,
  eliminarForo,
  cambiarEstadoForo,
   getDashboardForo   
} from '../controllers/foroController.js';
import {
  crearForoValidator,
  actualizarForoValidator,
  cambiarEstadoForoValidator,
  obtenerForoPorIdValidator,
  obtenerForosPorCursoValidator
} from '../middlewares/validators/foroValidator.js';
import { validationResult } from 'express-validator';

const router = express.Router();

// Middleware para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Middleware para subir archivos (imágenes, videos, PDFs)
import multer from 'multer';

const storage = multer.memoryStorage();

const uploadArchivosForoMiddleware = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
    files: 5 // Máximo 5 archivos
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'application/pdf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP), videos (MP4, MPEG, MOV) y archivos PDF'), false);
    }
  }
});

// Rutas de foros

// Crear foro (solo docente y administrador)
router.post(
  '/',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  uploadArchivosForoMiddleware.array('archivos', 5),
  crearForoValidator,
  handleValidationErrors,
  crearForo
);

router.get(
  '/:id/dashboard',
  authMiddleware,
  obtenerForoPorIdValidator,   // reutiliza el mismo validator de ID
  handleValidationErrors,
  getDashboardForo
);

// Obtener foros por curso
router.get(
  '/curso/:cursoId',
  authMiddleware,
  obtenerForosPorCursoValidator,
  handleValidationErrors,
  obtenerForosPorCurso
);

// Obtener foro por ID
router.get(
  '/:id',
  authMiddleware,
  obtenerForoPorIdValidator,
  handleValidationErrors,
  obtenerForoPorId
);

// Actualizar foro
router.put(
  '/:id',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  actualizarForoValidator,
  handleValidationErrors,
  actualizarForo
);

// Cambiar estado del foro (abrir/cerrar)
router.patch(
  '/:id/estado',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  cambiarEstadoForoValidator,
  handleValidationErrors,
  cambiarEstadoForo
);

// Eliminar foro
router.delete(
  '/:id',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  obtenerForoPorIdValidator,
  handleValidationErrors,
  eliminarForo
);

export default router;