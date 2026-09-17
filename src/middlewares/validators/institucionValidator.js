import { body } from 'express-validator';
import { normalizarTelefono } from '../../utils/normalizarTelefono.js';

const sanitizarTelefono = (value) => normalizarTelefono(value) ?? value;

// A diferencia de casi todos los demás "crear X" del backend, esta ruta no
// tenía ningún validator -- el nombre/apellido/cédula del admin ya quedaban
// cubiertos por el schema de User, pero el teléfono (de la institución y del
// admin) no tenía ningún chequeo de formato en ningún lado.
export const crearInstitucionValidator = [
  body('nombre')
    .notEmpty().withMessage('El nombre de la institución es requerido')
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('El nombre debe tener entre 2 y 150 caracteres'),

  body('nit')
    .notEmpty().withMessage('El NIT es requerido')
    .trim(),

  body('correo')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('El correo de la institución no es válido')
    .normalizeEmail(),

  body('telefono')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(sanitizarTelefono)
    .matches(/^\+57\d{10}$/).withMessage('El teléfono de la institución debe iniciar con +57 y tener 10 dígitos numéricos'),

  body('adminNombre')
    .notEmpty().withMessage('El nombre del administrador es requerido')
    .trim(),

  body('adminApellido')
    .notEmpty().withMessage('El apellido del administrador es requerido')
    .trim(),

  body('adminCedula')
    .notEmpty().withMessage('La cédula del administrador es requerida')
    .trim()
    .matches(/^\d{6,10}$/).withMessage('La cédula del administrador debe tener entre 6 y 10 dígitos numéricos'),

  body('adminCorreo')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('El correo del administrador no es válido')
    .normalizeEmail(),

  body('adminTelefono')
    .notEmpty().withMessage('El teléfono del administrador es requerido')
    .trim()
    .customSanitizer(sanitizarTelefono)
    .matches(/^\+57\d{10}$/).withMessage('El teléfono del administrador debe iniciar con +57 y tener 10 dígitos numéricos'),
];
