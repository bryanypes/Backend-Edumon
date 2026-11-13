import { body, param } from 'express-validator';

export const crearMensajeValidator = [
  body('foroId')
    .trim()
    .notEmpty()
    .withMessage('El ID del foro es requerido')
    .isMongoId()
    .withMessage('ID de foro inválido'),

  body('contenido')
    .trim()
    .notEmpty()
    .withMessage('El contenido es requerido')
    .isLength({ min: 1, max: 1500 })
    .withMessage('El contenido debe tener entre 1 y 1500 caracteres'),

  body('respuestaA').optional().isMongoId().withMessage('ID de mensaje inválido'),
];

export const actualizarMensajeValidator = [
  param('id').isMongoId().withMessage('ID de mensaje inválido'),

  body('contenido')
    .trim()
    .notEmpty()
    .withMessage('El contenido es requerido')
    .isLength({ min: 1, max: 1500 })
    .withMessage('El contenido debe tener entre 1 y 1500 caracteres'),
];

export const obtenerMensajesPorForoValidator = [param('foroId').isMongoId().withMessage('ID de foro inválido')];

export const toggleLikeMensajeValidator = [param('id').isMongoId().withMessage('ID de mensaje inválido')];

export const eliminarMensajeValidator = [param('id').isMongoId().withMessage('ID de mensaje inválido')];
