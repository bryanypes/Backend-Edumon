import express from 'express';
import { 
  createNotificacion,
  getMisNotificaciones,
  getNotificacionById,
  marcarComoLeida,
  marcarVariasLeidas,
  marcarTodasLeidas,
  deleteNotificacion,
  eliminarLeidasAntiguas,
  getConteoNoLeidas
} from '../controllers/notificacionController.js';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import { 
  createNotificacionValidator,
  updateNotificacionValidator,
  marcarVariasLeidasValidator,
  getNotificacionesValidator,
  notificacionIdValidator
} from '../middlewares/validators/notificacionValidator.js';

const router = express.Router();

router.get(
  '/',
  authMiddleware,
  getNotificacionesValidator,
  getMisNotificaciones
);

router.get(
  '/conteo-no-leidas',
  authMiddleware,
  getConteoNoLeidas
);

router.get(
  '/:id',
  authMiddleware,
  notificacionIdValidator,
  getNotificacionById
);

// uso interno/admin: el body fija el usuarioId destino, requireRole evita que
// cualquiera cree notificaciones "del sistema" a nombre de otro usuario
router.post(
  '/',
  authMiddleware,
  requireRole(['administrador', 'superadmin']),
  createNotificacionValidator,
  createNotificacion
);

router.patch(
  '/:id/leer',
  authMiddleware,
  updateNotificacionValidator,
  marcarComoLeida
);

router.patch(
  '/leer-multiples',
  authMiddleware,
  marcarVariasLeidasValidator,
  marcarVariasLeidas
);

router.patch(
  '/leer-todas',
  authMiddleware,
  marcarTodasLeidas
);

router.delete(
  '/:id',
  authMiddleware,
  notificacionIdValidator,
  deleteNotificacion
);

router.delete(
  '/limpiar/antiguas',
  authMiddleware,
  eliminarLeidasAntiguas
);

export default router;