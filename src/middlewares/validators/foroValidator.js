import { body, param } from 'express-validator';

export const crearForoValidator = [
  body('titulo')
    .trim()
    .notEmpty()
    .withMessage('El título es requerido')
    .isLength({ min: 5, max: 200 })
    .withMessage('El título debe tener entre 5 y 200 caracteres'),

  body('descripcion')
    .trim()
    .notEmpty()
    .withMessage('La descripción es requerida')
    .isLength({ min: 10, max: 2000 })
    .withMessage('La descripción debe tener entre 10 y 2000 caracteres'),

  body('cursoId')
    .trim()
    .notEmpty()
    .withMessage('El ID del curso es requerido')
    .isMongoId()
    .withMessage('ID de curso inválido'),

  body('publico').optional().isBoolean().withMessage('El campo público debe ser verdadero o falso'),
];

export const actualizarForoValidator = [
  param('id').isMongoId().withMessage('ID de foro inválido'),

  body('titulo')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('El título debe tener entre 5 y 200 caracteres'),

  body('descripcion')
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('La descripción debe tener entre 10 y 2000 caracteres'),

  body('estado').optional().isIn(['abierto', 'cerrado']).withMessage('Estado inválido'),

  body('publico').optional().isBoolean().withMessage('El campo público debe ser verdadero o falso'),
];

export const cambiarEstadoForoValidator = [
  param('id').isMongoId().withMessage('ID de foro inválido'),

  body('estado')
    .notEmpty()
    .withMessage('El estado es requerido')
    .isIn(['abierto', 'cerrado'])
    .withMessage('Estado inválido (debe ser "abierto" o "cerrado")'),
];

export const obtenerForoPorIdValidator = [param('id').isMongoId().withMessage('ID de foro inválido')];

export const obtenerForosPorCursoValidator = [param('cursoId').isMongoId().withMessage('ID de curso inválido')];
