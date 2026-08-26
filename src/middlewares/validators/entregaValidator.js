import { body, param } from 'express-validator';

export const createEntregaValidator = [
  body('tareaId')
    .notEmpty().withMessage('El ID de la tarea es obligatorio')
    .isMongoId().withMessage('El ID de la tarea no es válido'),

  body('padreId')
    .notEmpty().withMessage('El ID del padre es obligatorio')
    .isMongoId().withMessage('El ID del padre no es válido')
    .custom((value, { req }) => {
      if (req.user && value !== req.user.userId) {
        throw new Error('Solo puedes crear entregas para ti mismo');
      }
      return true;
    }),

  body('archivos')
    .optional()
    .isArray().withMessage('Los archivos deben ser un array'),

  body('textoRespuesta')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('El texto de respuesta no puede exceder 5000 caracteres'),

  body('estado')
    .optional()
    .isIn(["borrador", "enviada", "tarde"])
    .withMessage('Estado no válido')
];

export const updateEntregaValidator = [
  param('id')
    .isMongoId().withMessage('El ID de la entrega no es válido'),

  body('archivos')
    .optional()
    .isArray().withMessage('Los archivos deben ser un array'),

  body('textoRespuesta')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('El texto de respuesta no puede exceder 5000 caracteres'),

  body('estado')
    .optional()
    .isIn(["borrador", "enviada", "tarde"])
    .withMessage('Estado no válido'),

  body('padreId')
    .custom((value) => {
      if (value !== undefined) throw new Error('No puedes cambiar el padre de una entrega');
      return true;
    }),

  body('tareaId')
    .custom((value) => {
      if (value !== undefined) throw new Error('No puedes cambiar la tarea de una entrega');
      return true;
    })
];

// docenteId no viene del body (se extrae del token en el controlador);
// el body solo acepta valoracion (1-5) y comentario opcional.
export const calificarEntregaValidator = [
  param('id')
    .isMongoId().withMessage('El ID de la entrega no es válido'),

  body('valoracion')
    .notEmpty().withMessage('La valoración es obligatoria')
    .isInt({ min: 1, max: 5 }).withMessage('La valoración debe ser un entero entre 1 y 5'),

  body('comentario')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('El comentario no puede exceder 1000 caracteres'),

  // Bloquear explícitamente docenteId en body — ya no se acepta
  body('docenteId')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('docenteId no debe enviarse en el body. Se toma del token de sesión.');
      }
      return true;
    })
];

export const entregaIdValidator = [
  param('id')
    .isMongoId().withMessage('El ID de la entrega no es válido')
];