import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  crearMensaje,
  obtenerMensajesPorForo,
  toggleLikeMensaje,
  eliminarMensaje,
  actualizarMensaje
} from '../controllers/mensajeForoController.js';
import {
  crearMensajeValidator,
  actualizarMensajeValidator,
  obtenerMensajesPorForoValidator,
  toggleLikeMensajeValidator,
  eliminarMensajeValidator
} from '../middlewares/validators/mensajeForoValidator.js';
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

const uploadArchivosMensajeMiddleware = multer({
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
  uploadArchivosMensajeMiddleware.array('archivos', 5),
  crearMensajeValidator,
  handleValidationErrors,
  crearMensaje
);

router.get(
  '/foro/:foroId',
  authMiddleware,
  obtenerMensajesPorForoValidator,
  handleValidationErrors,
  obtenerMensajesPorForo
);

router.post(
  '/:id/like',
  authMiddleware,
  toggleLikeMensajeValidator,
  handleValidationErrors,
  toggleLikeMensaje
);

router.put(
  '/:id',
  authMiddleware,
  actualizarMensajeValidator,
  handleValidationErrors,
  actualizarMensaje
);

router.delete(
  '/:id',
  authMiddleware,
  eliminarMensajeValidator,
  handleValidationErrors,
  eliminarMensaje
);

export default router;