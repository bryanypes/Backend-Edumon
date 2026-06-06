import express from 'express';
import { 
  createUser, 
  getUsers, 
  getUserById,
  getProfile,
  updateUser, 
  deleteUser,
  getFotosPredeterminadas,
  updateFotoPerfil,
  updateFcmToken,
  getUltimasSesiones,
  getPadreInfo
} from '../controllers/userController.js';
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { uploadImagenCloudinary } from '../middlewares/cloudinaryMiddleware.js';
import { 
  createUserValidator,
  updateUserValidator,
  userIdValidator,
  updateFcmTokenValidator
} from '../middlewares/validators/userValidator.js';
import { param } from 'express-validator';

const router = express.Router();

// ─── Rutas /me (deben ir ANTES de /:id para no colisionar) ───
router.get('/me/profile', authMiddleware, getProfile);

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

// ─── Rutas especiales (también antes de /:id) ────────────────
router.get('/fotos-predeterminadas', authMiddleware, getFotosPredeterminadas);
router.get('/sesiones/ultimas', authMiddleware, getUltimasSesiones);

/**
 * GET /users/padre/:padreId/info
 * Docente / administrador ve información básica del padre/acudiente.
 * Incluye nombre, contacto y cursos en común.
 */
router.get(
  '/padre/:padreId/info',
  authMiddleware,
  [param('padreId').isMongoId().withMessage('ID de padre inválido')],
  getPadreInfo
);

// ─── CRUD general ────────────────────────────────────────────
router.post('/', authMiddleware, createUserValidator, createUser);
router.get('/', authMiddleware, getUsers);

router.get('/:id', authMiddleware, userIdValidator, getUserById);
router.put('/:id', authMiddleware, updateUserValidator, updateUser);
router.delete('/:id', authMiddleware, userIdValidator, deleteUser);

export default router;