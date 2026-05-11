import express from 'express';
import { enviarMensaje, obtenerMensajes, marcarLeido } from '../controllers/buzonController.js';
import { buzonValidator, buzonRateLimit } from '../middlewares/validators/buzonValidator.js';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Pública — con rate limit y validación
router.post('/', buzonRateLimit, buzonValidator, enviarMensaje);

// Privadas — solo superadmin
router.get('/', authMiddleware, requireRole(['superadmin']), obtenerMensajes);
router.patch('/:id/leido', authMiddleware, requireRole(['superadmin']), marcarLeido);

export default router;