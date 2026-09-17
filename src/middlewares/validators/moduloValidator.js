import { body, param } from 'express-validator';

export const createModuloValidator = [
  body('cursoId')
    .notEmpty().withMessage('El ID del curso es obligatorio')
    .isMongoId().withMessage('El ID del curso no es válido'),
  
  body('titulo')
    .notEmpty().withMessage('El título es obligatorio')
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('El título debe tener entre 3 y 200 caracteres'),
  
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('La descripción no puede exceder 1000 caracteres')
];

export const updateModuloValidator = [
  param('id')
    .isMongoId().withMessage('El ID del módulo no es válido'),

  // no se puede mover un módulo a otro curso por esta ruta -- rechazado
  // explícitamente (antes se aceptaba/validaba el formato pero el
  // controlador lo descartaba en silencio, dejando la falsa impresión de
  // que el cambio de curso había funcionado)
  body('cursoId')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('No se puede cambiar el curso de un módulo existente');
      }
      return true;
    }),

  // igual que "cursoId": el cambio de estado va por /:id/archivar y /:id/restaurar
  body('estado')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('El estado se cambia con los endpoints de archivar/restaurar, no desde aquí');
      }
      return true;
    }),

  body('titulo')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('El título debe tener entre 3 y 200 caracteres'),
  
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('La descripción no puede exceder 1000 caracteres')
];

export const moduloIdValidator = [
  param('id')
    .isMongoId().withMessage('El ID del módulo no es válido')
];

export const cursoIdValidator = [
  param('cursoId')
    .isMongoId().withMessage('El ID del curso no es válido')
];