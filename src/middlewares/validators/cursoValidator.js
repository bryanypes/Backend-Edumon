import { body, param } from 'express-validator';
import { normalizarTelefono } from '../../utils/normalizarTelefono.js';

/** Mismo saneado de teléfonos que en auth y usuarios: siempre +57XXXXXXXXXX. */
const sanitizarTelefono = (value) => normalizarTelefono(value) ?? value;

export const createCursoValidator = [
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .trim(),

  body('descripcion')
    .notEmpty()
    .withMessage('La descripción es requerida')
    .isLength({ min: 10, max: 500 })
    .withMessage('La descripción debe tener entre 10 y 500 caracteres')
    .trim(),

  body('docenteId')
    .notEmpty()
    .withMessage('El ID del docente es requerido')
    .isMongoId()
    .withMessage('El ID del docente debe ser un ObjectId válido'),

  body('fotoPortadaUrl')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value, { req }) => {
      if (req.files?.fotoPortada?.[0] || req.file?.fieldname === 'fotoPortada') {
        return true;
      }

      if (value && value !== '') {
        const urlRegex = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
        if (!urlRegex.test(value)) {
          throw new Error('La URL de la foto debe ser válida y terminar en jpg, jpeg, png, gif o webp');
        }
      }

      return true;
    }),

  body('color')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
    .withMessage('El color debe ser un código hexadecimal válido (ej. #3B82F6)')
];

export const updateCursoValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de curso inválido'),

  body('nombre')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .trim(),

  body('descripcion')
    .optional()
    .isLength({ min: 10, max: 500 })
    .withMessage('La descripción debe tener entre 10 y 500 caracteres')
    .trim(),

  body('fotoPortadaUrl')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value, { req }) => {
      if (req.file?.fieldname === 'fotoPortada') {
        return true;
      }

      if (value && value !== '') {
        const urlRegex = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
        if (!urlRegex.test(value)) {
          throw new Error('La URL de la foto debe ser válida y terminar en jpg, jpeg, png, gif o webp');
        }
      }

      return true;
    }),

  body('color')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
    .withMessage('El color debe ser un código hexadecimal válido (ej. #3B82F6)')
];

export const participanteValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de curso inválido'),

  body('nombre')
    .notEmpty()
    .withMessage('El nombre es requerido')
    .trim(),

  body('apellido')
    .notEmpty()
    .withMessage('El apellido es requerido')
    .trim(),

  body('telefono')
    .notEmpty()
    .withMessage('El teléfono es requerido')
    .trim()
    .customSanitizer(sanitizarTelefono)
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),

  body('cedula')
    .notEmpty()
    .withMessage('La cédula es requerida')
    .trim()
    .matches(/^\d{6,10}$/)
    .withMessage('La cédula debe contener entre 6 y 10 dígitos numéricos')
];

export const cursoIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de curso inválido')
];

export const csvFileValidator = [
  body().custom((value, { req }) => {
    if (!req.file && !req.files?.archivo) {
      throw new Error('Se requiere un archivo CSV');
    }
    return true;
  })
];