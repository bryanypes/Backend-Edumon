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

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

import multer from 'multer';

const storage = multer.memoryStorage();

const uploadArchivosForoMiddleware = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
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
  obtenerForoPorIdValidator,
  handleValidationErrors,
  getDashboardForo
);

router.get(
  '/curso/:cursoId',
  authMiddleware,
  obtenerForosPorCursoValidator,
  handleValidationErrors,
  obtenerForosPorCurso
);

router.get(
  '/:id',
  authMiddleware,
  obtenerForoPorIdValidator,
  handleValidationErrors,
  obtenerForoPorId
);

router.put(
  '/:id',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  actualizarForoValidator,
  handleValidationErrors,
  actualizarForo
);

router.patch(
  '/:id/estado',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  cambiarEstadoForoValidator,
  handleValidationErrors,
  cambiarEstadoForo
);

router.delete(
  '/:id',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  obtenerForoPorIdValidator,
  handleValidationErrors,
  eliminarForo
);

export default router;