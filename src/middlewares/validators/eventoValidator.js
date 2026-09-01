import { body, param } from 'express-validator';

export const createEventoValidator = [
  body('titulo')
    .notEmpty()
    .withMessage('El título es requerido')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),

  body('descripcion')
    .notEmpty()
    .withMessage('La descripción es requerida')
    .trim()
    .isLength({ min: 10 })
    .withMessage('La descripción debe tener al menos 10 caracteres'),

  body('fechaInicio')
    .notEmpty()
    .withMessage('La fecha de inicio es requerida')
    .isISO8601()
    .withMessage('La fecha de inicio debe ser válida')
    .custom((value) => {
      const fecha = new Date(value);
      if (fecha < new Date()) {
        throw new Error('La fecha de inicio debe ser futura');
      }
      return true;
    }),

  body('fechaFin')
    .notEmpty()
    .withMessage('La fecha de fin es requerida')
    .isISO8601()
    .withMessage('La fecha de fin debe ser válida')
    .custom((value, { req }) => {
      const fechaFin = new Date(value);
      const fechaInicio = new Date(req.body.fechaInicio);
      
      if (fechaFin <= fechaInicio) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      }
      return true;
    }),

  body('hora')
    .notEmpty()
    .withMessage('La hora es requerida')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('La hora debe estar en formato HH:MM (24 horas)'),

  body('ubicacion')
    .notEmpty()
    .withMessage('La ubicación es requerida')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('La ubicación debe tener entre 3 y 200 caracteres'),

  body('cursosIds')
    .custom((value) => {
      // acepta string de form-data o array JSON
      let cursosArray = value;

      if (typeof value === 'string') {
        try {
          cursosArray = JSON.parse(value);
        } catch (e) {
          throw new Error('El formato de cursosIds es inválido. Debe ser un array JSON válido');
        }
      }

      if (!Array.isArray(cursosArray)) {
        throw new Error('cursosIds debe ser un array');
      }

      if (cursosArray.length === 0) {
        throw new Error('Debes seleccionar al menos un curso');
      }

      if (!cursosArray.every(id => /^[0-9a-fA-F]{24}$/.test(id))) {
        throw new Error('Uno o más IDs de curso no son válidos');
      }
      
      return true;
    }),

  body('categoria')
    .notEmpty()
    .withMessage('La categoría es requerida')
    .isIn(['escuela_padres', 'tarea', 'institucional'])
    .withMessage('La categoría debe ser: escuela_padres, tarea o institucional')
];

export const updateEventoValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de evento inválido'),

  body('titulo')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),

  body('descripcion')
    .optional()
    .trim()
    .isLength({ min: 10 })
    .withMessage('La descripción debe tener al menos 10 caracteres'),

  body('fechaInicio')
    .optional()
    .isISO8601()
    .withMessage('La fecha de inicio debe ser válida'),

  body('fechaFin')
    .optional()
    .isISO8601()
    .withMessage('La fecha de fin debe ser válida')
    .custom((value, { req }) => {
      if (req.body.fechaInicio) {
        const fechaFin = new Date(value);
        const fechaInicio = new Date(req.body.fechaInicio);
        
        if (fechaFin <= fechaInicio) {
          throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
        }
      }
      return true;
    }),

  body('hora')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('La hora debe estar en formato HH:MM (24 horas)'),

  body('ubicacion')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('La ubicación debe tener entre 3 y 200 caracteres'),

  body('cursosIds')
  .optional()
  .custom((value) => {
    let cursosArray = value;

    if (typeof value === 'string') {
      try {
        cursosArray = JSON.parse(value);
      } catch (e) {
        throw new Error('El formato de cursosIds es inválido. Debe ser un array JSON válido');
      }
    }

    if (!Array.isArray(cursosArray)) {
      throw new Error('cursosIds debe ser un array');
    }

    if (cursosArray.length === 0) {
      throw new Error('Debes seleccionar al menos un curso');
    }

    if (!cursosArray.every(id => /^[0-9a-fA-F]{24}$/.test(id))) {
      throw new Error('Uno o más IDs de curso no son válidos');
    }

    return true;
  }),


  body('categoria')
    .optional()
    .isIn(['escuela_padres', 'tarea', 'institucional'])
    .withMessage('La categoría debe ser: escuela_padres, tarea o institucional'),

  body('estado')
    .optional()
    .isIn(['programado', 'en_curso', 'finalizado', 'cancelado'])
    .withMessage('El estado debe ser: programado, en_curso, finalizado o cancelado')
];

export const eventoIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de evento inválido')
];