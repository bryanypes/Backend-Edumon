// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user || user.estado !== 'activo') {
      return res.status(401).json({ message: 'Token inválido o usuario inactivo' });
    }

    req.user = {
      userId: decoded.userId,
      rol: user.rol,
      institucionId: user.institucionId?.toString() || null,
      // Perfil activo (null = titular)
      perfilId: decoded.perfilId || null,
      esTitular: decoded.esTitular !== false
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado' });
    }
    return res.status(403).json({ message: 'Token inválido' });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autenticado' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ message: 'No tienes permisos para esta acción' });
    }
    next();
  };
};

export const requireMismaInstitucion = (req, res, next) => {
  if (req.user.rol === 'superadmin') return next();
  if (!req.user.institucionId) {
    return res.status(403).json({ message: 'Sin institución asignada' });
  }
  next();
};