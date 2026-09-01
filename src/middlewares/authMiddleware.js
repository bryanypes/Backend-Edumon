import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { extractAccessToken } from '../controllers/authController.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = extractAccessToken(req);

    if (!token) {
      return res.status(401).json({ message: 'Token requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user || user.estado !== 'activo') {
      return res.status(401).json({ message: 'Token inválido o usuario inactivo' });
    }

    req.user = {
      userId:        decoded.userId,
      rol:           user.rol,
      institucionId: user.institucionId?.toString() || null,
      perfilId:      decoded.perfilId || null,
      esTitular:     decoded.esTitular !== false,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // El cliente debe llamar a /api/auth/refresh automáticamente
      return res.status(401).json({ message: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return res.status(403).json({ message: 'Token inválido' });
    }
    console.error('Error inesperado en authMiddleware:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Control de roles
export const requireRole = (roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'No autenticado' });
  if (!roles.includes(req.user.rol))
    return res.status(403).json({ message: 'No tienes permisos para esta acción' });
  next();
};

// Control de institución
export const requireMismaInstitucion = (req, res, next) => {
  if (req.user.rol === 'superadmin') return next();
  if (!req.user.institucionId)
    return res.status(403).json({ message: 'Sin institución asignada' });
  next();
};