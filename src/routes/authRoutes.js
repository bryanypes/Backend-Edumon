import express from 'express';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getProfile,
  changePassword,
  forgotPassword,
  forgotPasswordPhone,
  resetPassword,
  resetPasswordPhone,
} from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  registerValidator,
  loginValidator,
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  forgotPasswordPhoneValidator,
  resetPasswordPhoneValidator,
} from '../middlewares/validators/authValidator.js';

const router = express.Router();

// ─── Rutas públicas ───────────────────────────────────────────────────────────
router.post('/register',              registerValidator,              register);
router.post('/login',                 loginValidator,                 login);

// Recuperación de contraseña
router.post('/forgot-password',       forgotPasswordValidator,        forgotPassword);
router.post('/reset-password',        resetPasswordValidator,         resetPassword);
router.post('/forgot-password-phone', forgotPasswordPhoneValidator,   forgotPasswordPhone);
router.post('/reset-password-phone',  resetPasswordPhoneValidator,    resetPasswordPhone);

// ─── Refresh de sesión (no requiere access token válido) ──────────────────────
// Usa únicamente la cookie refresh_token (path restringido a este endpoint)
router.post('/refresh', refresh);

// ─── Rutas protegidas ─────────────────────────────────────────────────────────
router.get('/profile',         authMiddleware,                    getProfile);
router.post('/change-password',authMiddleware, changePasswordValidator, changePassword);
router.post('/logout',         authMiddleware,                    logout);
router.post('/logout-all',     authMiddleware,                    logoutAll);

export default router;