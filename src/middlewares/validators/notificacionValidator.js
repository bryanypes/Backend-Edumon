import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';

export const createNotificacionValidator = [
  body('usuarioId')
    .notEmpty().withMessage('El ID del usuario es obligatorio')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('El ID del usuario no es válido');
      }
      return true;
    }),

  body('tipo')
    .notEmpty().withMessage('El tipo es obligatorio')
    .isIn(['tarea', 'entrega', 'calificacion', 'foro', 'evento', 'sistema'])
    .withMessage('El tipo debe ser: tarea, entrega, calificacion, foro, evento o sistema'),

  body('mensaje')
    .notEmpty().withMessage('El mensaje es obligatorio')
    .trim()
    .isLength({ max: 500 }).withMessage('El mensaje no puede exceder 500 caracteres'),

  body('prioridad')
    .optional()
    .isIn(['baja', 'media', 'alta', 'critica'])
    .withMessage('La prioridad debe ser: baja, media, alta o critica'),

  body('referenciaId')
    .optional()
    .custom((value) => {
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('El ID de referencia no es válido');
      }
      return true;
    }),

  body('referenciaModelo')
    .optional()
    .isIn(['Tarea', 'Entrega', 'Curso', 'Modulo', 'User'])
    .withMessage('El modelo de referencia debe ser: Tarea, Entrega, Curso, Modulo o User'),

  body('metadata')
    .optional()
    .isObject().withMessage('Los metadatos deben ser un objeto')
];

export const updateNotificacionValidator = [
  param('id')
    .notEmpty().withMessage('El ID de la notificación es obligatorio')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('El ID de la notificación no es válido');
      }
      return true;
    }),

  query('leido')
    .optional()
    .customSanitizer(value => {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    })
    .isBoolean().withMessage('El filtro leído debe ser true o false')
];

export const marcarVariasLeidasValidator = [
  body('notificacionIds')
    .notEmpty().withMessage('Los IDs de notificaciones son obligatorios')
    .isArray().withMessage('Los IDs deben ser un array')
    .custom((value) => {
      if (!value.every(id => mongoose.Types.ObjectId.isValid(id))) {
        throw new Error('Uno o más IDs de notificaciones no son válidos');
      }
      return true;
    })
];

export const getNotificacionesValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('La página debe ser un número entero mayor a 0'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),

  query('tipo')
    .optional()
    .isIn(['tarea', 'entrega', 'calificacion', 'foro', 'evento', 'sistema'])
    .withMessage('El tipo debe ser válido'),

  query('leido')
    .optional()
    .isBoolean().withMessage('El filtro leído debe ser true o false')
];

export const notificacionIdValidator = [
  param('id')
    .notEmpty().withMessage('El ID de la notificación es obligatorio')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('El ID de la notificación no es válido');
      }
      return true;
    })
];