import express from 'express';
import { 
  register, 
  login, 
  getProfile, 
  changePassword, 
  logout,
  forgotPassword,
  forgotPasswordPhone,
  resetPassword,
  resetPasswordPhone
} from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { 
  registerValidator, 
  loginValidator, 
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  forgotPasswordPhoneValidator,
  resetPasswordPhoneValidator
} from '../middlewares/validators/authValidator.js';

const router = express.Router();

// ─── Rutas públicas ───────────────────────────
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);

// Recuperación por correo
router.post('/forgot-password', forgotPasswordValidator, forgotPassword);
router.post('/reset-password', resetPasswordValidator, resetPassword);

// Recuperación por teléfono (WhatsApp)
router.post('/forgot-password-phone', forgotPasswordPhoneValidator, forgotPasswordPhone);
router.post('/reset-password-phone', resetPasswordPhoneValidator, resetPasswordPhone);

// ─── Rutas protegidas ─────────────────────────
router.get('/profile', authMiddleware, getProfile);
router.post('/change-password', authMiddleware, changePasswordValidator, changePassword);
router.post('/logout', authMiddleware, logout);

export default router;