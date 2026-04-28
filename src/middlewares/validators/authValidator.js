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

  body('cedula')
    .notEmpty()
    .withMessage('La cédula es requerida')
    .trim()
    .matches(/^\d{6,10}$/)
    .withMessage('La cédula debe contener entre 6 y 10 dígitos numéricos'),

  body('correo')
    .notEmpty()
    .withMessage('El correo es requerido')
    .isEmail()
    .withMessage('El correo electrónico no es válido')
    .normalizeEmail(),

  body('contraseña')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una minúscula, una mayúscula y un número'),

  // CORRECCIÓN: superadmin excluido del registro público
  body('rol')
    .notEmpty()
    .withMessage('El rol es requerido')
    .isIn(['padre', 'docente', 'administrador'])
    .withMessage('El rol debe ser: padre, docente o administrador'),

  body('telefono')
    .notEmpty()
    .withMessage('El teléfono es requerido')
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),

  // NUEVO: institución requerida para todos los roles del registro público
  body('institucionId')
    .notEmpty()
    .withMessage('La institución es requerida')
    .isMongoId()
    .withMessage('ID de institución inválido'),
];

export const loginValidator = [
  body('telefono')
    .notEmpty()
    .withMessage('El teléfono es requerido')
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),

  body('contraseña')
    .notEmpty()
    .withMessage('La contraseña es requerida'),
];

// CORRECCIÓN: contraseñaNueva ahora exige el mismo estándar de complejidad
export const changePasswordValidator = [
  body('contraseñaActual')
    .notEmpty()
    .withMessage('La contraseña actual es requerida'),

  body('contraseñaNueva')
    .notEmpty()
    .withMessage('La nueva contraseña es requerida')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña nueva debe tener entre 6 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una minúscula, una mayúscula y un número'),
];

export const forgotPasswordValidator = [
  body('correo')
    .notEmpty()
    .withMessage('El correo es requerido')
    .isEmail()
    .withMessage('El correo electrónico no es válido')
    .normalizeEmail(),
];

export const resetPasswordValidator = [
  body('correo')
    .notEmpty()
    .withMessage('El correo es requerido')
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
    .notEmpty()
    .withMessage('La nueva contraseña es requerida')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una minúscula, una mayúscula y un número'),
];