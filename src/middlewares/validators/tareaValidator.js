import { body, param, query } from 'express-validator';

export const createTareaValidator = [
  body('titulo')
    .notEmpty().withMessage('El título es obligatorio')
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('El título debe tener entre 3 y 200 caracteres'),
  
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('La descripción no puede exceder 2000 caracteres'),
  
  body('fechaEntrega')
    .notEmpty().withMessage('La fecha de entrega es obligatoria')
    .isISO8601().withMessage('La fecha de entrega debe ser válida')
    .custom((value) => {
      if (new Date(value) < new Date()) {
        throw new Error('La fecha de entrega debe ser futura');
      }
      return true;
    }),
  
  
  body('etiquetas')
    .optional()
    .isArray().withMessage('Las etiquetas deben ser un array'),
  
  body('tipoEntrega')
    .notEmpty().withMessage('El tipo de entrega es obligatorio')
    .isIn(["texto", "archivo", "multimedia", "enlace", "presencial", "grupal"])
    .withMessage('Tipo de entrega no válido'),
  
  body('archivosAdjuntos')
    .optional()
    .isArray().withMessage('Los archivos adjuntos deben ser un array'),
  
  body('criterios')
    .optional()
    .trim(),
  
  body('cursoId')
    .notEmpty().withMessage('El ID del curso es obligatorio')
    .isMongoId().withMessage('El ID del curso no es válido'),
  
  body('moduloId')
    .notEmpty().withMessage('El ID del módulo es obligatorio')
    .isMongoId().withMessage('El ID del módulo no es válido'),
  
  body('asignacionTipo')
    .optional()
    .isIn(["todos", "seleccionados"])
    .withMessage('El tipo de asignación debe ser "todos" o "seleccionados"'),
  
  body('participantesSeleccionados')
    .optional()
    .isArray().withMessage('Los participantes seleccionados deben ser un array')
    .custom((value, { req }) => {
      // Si es "seleccionados", debe tener al menos un participante
      if (req.body.asignacionTipo === 'seleccionados' && (!value || value.length === 0)) {
        throw new Error('Debe seleccionar al menos un participante');
      }
      return true;
    }),
  
  body('participantesSeleccionados.*')
    .optional()
    .isMongoId().withMessage('Los IDs de participantes deben ser válidos')
];

export const updateTareaValidator = [
  param('id')
    .isMongoId().withMessage('El ID de la tarea no es válido'),
  
  body('titulo')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('El título debe tener entre 3 y 200 caracteres'),
  
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('La descripción no puede exceder 2000 caracteres'),
  
  body('fechaEntrega')
    .optional()
    .isISO8601().withMessage('La fecha de entrega debe ser válida'),
  
  
  body('tipoEntrega')
    .optional()
    .isIn(["texto", "archivo", "multimedia", "enlace", "presencial", "grupal"])
    .withMessage('Tipo de entrega no válido'),
  
  body('estado')
    .optional()
    .isIn(["publicada", "cerrada"])
    .withMessage('Estado no válido'),
  
  body('cursoId')
    .optional()
    .isMongoId().withMessage('El ID del curso no es válido'),
  
  body('moduloId')
    .optional()
    .isMongoId().withMessage('El ID del módulo no es válido'),
    
  body('asignacionTipo')
    .optional()
    .isIn(["todos", "seleccionados"])
    .withMessage('El tipo de asignación debe ser "todos" o "seleccionados"'),
  
  body('participantesSeleccionados')
    .optional()
    .isArray().withMessage('Los participantes seleccionados deben ser un array')
    .custom((value, { req }) => {
      if (req.body.asignacionTipo === 'seleccionados' && (!value || value.length === 0)) {
        throw new Error('Debe seleccionar al menos un participante');
      }
      return true;
    }),
  
  body('participantesSeleccionados.*')
    .optional()
    .isMongoId().withMessage('Los IDs de participantes deben ser válidos')
];

export const tareaIdValidator = [
  param('id')
    .isMongoId().withMessage('El ID de la tarea no es válido')
];