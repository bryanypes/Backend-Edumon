import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';

export const buzonValidator = [
  body('nombre')
    .notEmpty().withMessage('El nombre es requerido')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios'),

  body('correo')
    .notEmpty().withMessage('El correo es requerido')
    .isEmail().withMessage('El correo no es válido')
    .normalizeEmail(),

  body('telefono')
    .notEmpty().withMessage('El teléfono es requerido')
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos'),

  body('mensaje')
    .notEmpty().withMessage('El mensaje es requerido')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('El mensaje debe tener entre 10 y 1000 caracteres')
];

// Máximo 3 envíos por IP cada 15 minutos
export const buzonRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: {
    error: 'Demasiados mensajes enviados. Intenta de nuevo en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
});