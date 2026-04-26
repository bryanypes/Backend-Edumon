import { body } from 'express-validator';

export const registerValidator = [
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios'),
  
  body('apellido')
    .notEmpty()
    .withMessage('El apellido es requerido')
    .isLength({ min: 2, max: 50 })
    .withMessage('El apellido debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El apellido solo puede contener letras y espacios'),
  
  body('correo')
    .isEmail()
    .withMessage('El correo electrónico no es válido')
    .normalizeEmail(),
  
  body('contraseña')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una minúscula, una mayúscula y un número'),
  
  body('rol')
    .isIn(['padre', 'docente', 'administrador','superadmin'])
    .withMessage('El rol debe ser: padre, docente o administrador'),
  
  body('telefono')
    .notEmpty()
    .withMessage('El teléfono es requerido')
    .matches(/^[+]?[1-9][\d]{0,15}$/)
    .withMessage('El formato del teléfono no es válido')
    .isLength({ min: 10, max: 15 })
    .withMessage('El teléfono debe tener entre 10 y 15 dígitos')
];

export const loginValidator = [
  body('telefono')
    .notEmpty()
    .withMessage('El teléfono es requerido')
    .matches(/^[+]?[1-9][\d]{0,15}$/)
    .withMessage('El formato del teléfono no es válido'),
  
  body('contraseña')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 1 })
    .withMessage('La contraseña no puede estar vacía')
];

export const changePasswordValidator = [
  body('contraseñaActual')
    .notEmpty()
    .withMessage('La contraseña actual es requerida'),
  
  body('contraseñaNueva')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña nueva debe tener entre 6 y 128 caracteres')
];

export const forgotPasswordValidator = [
  body('correo')
    .isEmail()
    .withMessage('El correo electrónico no es válido')
    .normalizeEmail()
];

export const resetPasswordValidator = [
  body('correo')
    .isEmail()
    .withMessage('El correo electrónico no es válido')
    .normalizeEmail(),

  body('codigo')
    .notEmpty()
    .withMessage('El código es requerido')
    .isLength({ min: 6, max: 6 })
    .withMessage('El código debe tener 6 dígitos')
    .isNumeric()
    .withMessage('El código solo debe contener números'),

  body('contraseñaNueva')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una minúscula, una mayúscula y un número')
];