import { body, param } from 'express-validator';

// CORRECCIÓN: contraseña ahora exige complejidad, no solo longitud
export const createUserValidator = [
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es requerido')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios'),

  body('apellido')
    .notEmpty()
    .withMessage('El apellido es requerido')
    .trim()
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

  // CORRECCIÓN: exige complejidad igual que registerValidator y resetPasswordValidator
  body('contraseña')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una minúscula, una mayúscula y un número'),

  body('rol')
    .notEmpty()
    .withMessage('El rol es requerido')
    .isIn(['padre', 'docente', 'administrador', 'superadmin'])
    .withMessage('El rol debe ser: padre, docente, administrador o superadmin'),

  body('telefono')
    .optional()
    .trim()
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),

  // NUEVO: institucionId requerido para todos excepto superadmin
  body('institucionId')
    .if((value, { req }) => req.body.rol !== 'superadmin')
    .notEmpty()
    .withMessage('La institución es requerida')
    .isMongoId()
    .withMessage('ID de institución inválido'),
];

export const updateUserValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de usuario inválido'),

  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios'),

  body('apellido')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El apellido debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El apellido solo puede contener letras y espacios'),

  body('cedula')
    .optional()
    .trim()
    .matches(/^\d{6,10}$/)
    .withMessage('La cédula debe contener entre 6 y 10 dígitos numéricos'),

  body('correo')
    .optional()
    .isEmail()
    .withMessage('El correo electrónico no es válido')
    .normalizeEmail(),

  body('rol')
    .optional()
    .isIn(['padre', 'docente', 'administrador', 'superadmin'])
    .withMessage('El rol debe ser: padre, docente, administrador o superadmin'),

  body('telefono')
    .optional()
    .trim()
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),

  body('estado')
    .optional()
    .isIn(['activo', 'suspendido'])
    .withMessage('El estado debe ser: activo o suspendido'),

  body('institucionId')
    .optional()
    .isMongoId()
    .withMessage('ID de institución inválido'),
];

export const userIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de usuario inválido'),
];

export const changePasswordValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de usuario inválido'),

  body('contraseñaActual')
    .notEmpty()
    .withMessage('La contraseña actual es requerida'),

  body('nuevaContraseña')
    .notEmpty()
    .withMessage('La nueva contraseña es requerida')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una minúscula, una mayúscula y un número'),

  body('confirmarContraseña')
    .notEmpty()
    .withMessage('Debes confirmar la contraseña')
    .custom((value, { req }) => {
      if (value !== req.body.nuevaContraseña) {
        throw new Error('Las contraseñas no coinciden');
      }
      return true;
    }),
];

export const updateFcmTokenValidator = [
  body('fcmToken')
    .notEmpty()
    .withMessage('El token FCM es requerido')
    .isString()
    .withMessage('El token FCM debe ser una cadena de texto')
    .isLength({ min: 20 })
    .withMessage('El token FCM no parece válido'),
];