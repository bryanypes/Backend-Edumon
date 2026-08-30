import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { normalizarTelefono } from '../../utils/normalizarTelefono.js';

// Mismo saneador que auth/user/curso validators: acepta "3001234567",
// "57 300 123 4567" o "+573001234567" y siempre deja "+57XXXXXXXXXX".
const sanitizarTelefono = (value) => normalizarTelefono(value) ?? value;

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

  // BUG REAL corregido: el formulario público (landing) marca este campo
  // como opcional y manda el teléfono tal cual lo escribe el usuario (sin
  // +57) — con `.notEmpty()` + regex estricto, CUALQUIER envío sin teléfono
  // o sin el prefijo +57 devolvía 400 siempre, dejando el formulario de
  // contacto roto en la práctica.
  body('telefono')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(sanitizarTelefono)
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos'),

  body('institucion')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage('La institución no puede exceder 150 caracteres'),

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