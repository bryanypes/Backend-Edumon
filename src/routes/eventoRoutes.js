import express from 'express';
import multer from 'multer';
import {
  createEvento,
  getEventos,
  getEventoById,
  updateEvento,
  deleteEvento,
  cancelarEvento,
  getEventosHoy
} from '../controllers/eventoController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  createEventoValidator,
  updateEventoValidator,
  eventoIdValidator
} from '../middlewares/validators/eventoValidator.js';

const router = express.Router();

/**
 * Multer para eventos: acepta dos campos opcionales
 *  - imagenPortada: 1 imagen (portada/logo del evento)
 *  - adjunto: 1 archivo adicional (PDF, doc, etc.)
 */
const storage = multer.memoryStorage();

const uploadEventoArchivos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB por archivo
  fileFilter: (req, file, cb) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'];
    const allTypes = [...imageTypes, 'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    if (file.fieldname === 'imagenPortada' && !imageTypes.includes(file.mimetype)) {
      return cb(new Error('La imagen de portada debe ser JPEG, PNG, WEBP o GIF'), false);
    }
    if (file.fieldname === 'adjunto' && !allTypes.includes(file.mimetype)) {
      return cb(new Error('El adjunto debe ser una imagen o PDF/Word'), false);
    }
    cb(null, true);
  }
}).fields([
  { name: 'imagenPortada', maxCount: 1 },
  { name: 'adjunto', maxCount: 1 }
]);

// Rutas
router.get('/', authMiddleware, getEventos);
router.get('/hoy', authMiddleware, getEventosHoy);
router.get('/:id', authMiddleware, eventoIdValidator, getEventoById);

router.post(
  '/',
  authMiddleware,
  uploadEventoArchivos,
  createEventoValidator,
  createEvento
);

router.put(
  '/:id',
  authMiddleware,
  uploadEventoArchivos,
  updateEventoValidator,
  updateEvento
);

router.delete(
  '/:id',
  authMiddleware,
  eventoIdValidator,
  deleteEvento
);

router.patch(
  '/:id/cancelar',
  authMiddleware,
  eventoIdValidator,
  cancelarEvento
);

export default router;