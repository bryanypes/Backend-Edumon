import express from 'express';
import { 
  createUser, 
  getUsers, 
  getUserById,
  getProfile,
  updateOwnProfile,
  updateUser,
  deleteUser,
  reactivateUser,
  getFotosPredeterminadas,
  updateFotoPerfil,
  updateFcmToken,
  updateModoOscuro,
  getUltimasSesiones,
  getPadreInfo
} from '../controllers/userController.js';
import { authMiddleware, requireRole } from "../middlewares/authMiddleware.js";
import { uploadImagenCloudinary } from '../middlewares/cloudinaryMiddleware.js';
import { 
  createUserValidator,
  updateUserValidator,
  updateOwnProfileValidator,
  userIdValidator,
  updateFcmTokenValidator,
  updateModoOscuroValidator
} from '../middlewares/validators/userValidator.js';
import { param } from 'express-validator';

const router = express.Router();

// ─── Rutas /me (deben ir ANTES de /:id para no colisionar) ───
router.get('/me/profile', authMiddleware, getProfile);

router.put('/me/profile',
  authMiddleware,
  updateOwnProfileValidator,
  updateOwnProfile
);

router.put('/me/foto-perfil',
  authMiddleware,
  uploadImagenCloudinary.single('foto'),
  updateFotoPerfil
);

router.put('/me/fcm-token',
  authMiddleware,
  updateFcmTokenValidator,
  updateFcmToken
);

router.patch('/me/modo-oscuro',
  authMiddleware,
  updateModoOscuroValidator,
  updateModoOscuro
);

// ─── Rutas especiales (también antes de /:id) ────────────────
router.get('/fotos-predeterminadas', authMiddleware, getFotosPredeterminadas);
router.get('/sesiones/ultimas', authMiddleware, getUltimasSesiones);

router.get(
  '/padre/:padreId/info',
  authMiddleware,
  [param('padreId').isMongoId().withMessage('ID de padre inválido')],
  getPadreInfo
);

// ─── CRUD general (panel de administración — nunca abierto a padres/docentes) ─
// updateUserValidator permite cambiar "rol"; sin este requireRole cualquier
// usuario autenticado podía autoelevarse a administrador vía PUT /:id.
router.post('/', authMiddleware, requireRole(['administrador', 'superadmin']), createUserValidator, createUser);
router.get('/', authMiddleware, requireRole(['administrador', 'superadmin']), getUsers);

router.get('/:id', authMiddleware, requireRole(['administrador', 'superadmin']), userIdValidator, getUserById);
router.put('/:id', authMiddleware, requireRole(['administrador', 'superadmin']), updateUserValidator, updateUser);
router.delete('/:id', authMiddleware, requireRole(['administrador', 'superadmin']), userIdValidator, deleteUser);
router.patch('/:id/reactivar', authMiddleware, requireRole(['administrador', 'superadmin']), userIdValidator, reactivateUser);

export default router;