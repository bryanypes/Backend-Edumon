import { body, param } from 'express-validator';
import { normalizarTelefono } from '../../utils/normalizarTelefono.js';
import { campoCorreo } from './correoValidator.js';

// normaliza a +57XXXXXXXXXX; si es inválido deja el valor original para que .matches() falle con el mensaje correcto
const sanitizarTelefono = (value) => normalizarTelefono(value) ?? value;

export const createUserValidator = [
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es requerido')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/)
    .withMessage('El nombre solo puede contener letras, espacios, guiones y apóstrofes'),

  body('apellido')
    .notEmpty()
    .withMessage('El apellido es requerido')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El apellido debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/)
    .withMessage('El apellido solo puede contener letras, espacios, guiones y apóstrofes'),

  body('cedula')
    .notEmpty()
    .withMessage('La cédula es requerida')
    .trim()
    .matches(/^\d{6,10}$/)
    .withMessage('La cédula debe contener entre 6 y 10 dígitos numéricos'),

  campoCorreo('correo', { requerido: true }),

  // opcional: si no viene, el controlador la fija a la cédula (regla única del sistema);
  // la política fuerte de contraseña solo aplica a las que el usuario elige
  body('contraseña')
    .optional({ checkFalsy: true })
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres'),

  body('rol')
    .notEmpty()
    .withMessage('El rol es requerido')
    .isIn(['padre', 'docente', 'administrador', 'superadmin'])
    .withMessage('El rol debe ser: padre, docente, administrador o superadmin'),

  body('telefono')
    .notEmpty()
    .withMessage('El teléfono es requerido')
    .trim()
    .customSanitizer(sanitizarTelefono)
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),

  // requerido solo para docente/administrador
  body('institucionId')
    .if(body('rol').isIn(['docente', 'administrador']))
    .notEmpty()
    .withMessage('La institución es requerida para docentes y administradores')
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
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/)
    .withMessage('El nombre solo puede contener letras, espacios, guiones y apóstrofes'),

  body('apellido')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El apellido debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/)
    .withMessage('El apellido solo puede contener letras, espacios, guiones y apóstrofes'),

  body('cedula')
    .optional()
    .trim()
    .matches(/^\d{6,10}$/)
    .withMessage('La cédula debe contener entre 6 y 10 dígitos numéricos'),

  campoCorreo('correo'),

  body('rol')
    .optional()
    .isIn(['padre', 'docente', 'administrador', 'superadmin'])
    .withMessage('El rol debe ser: padre, docente, administrador o superadmin'),

  body('telefono')
    .optional()
    .trim()
    .customSanitizer(sanitizarTelefono)
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),

  // "estado" no se puede cambiar por esta ruta -- rechazado explícitamente
  // (antes se aceptaba y validaba el formato, pero updateUser lo descartaba
  // en silencio; un 200 sin avisar que no pasó nada). El cambio de estado
  // va por DELETE /:id (suspender) y /:id/reactivar, que sí revisan cosas
  // como cursos activos antes de suspender a un docente.
  body('estado')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('El estado se cambia con DELETE /:id (suspender) o PATCH /:id/reactivar, no desde aquí');
      }
      return true;
    }),

  body('institucionId')
    .optional()
    .isMongoId()
    .withMessage('ID de institución inválido'),
];

export const updateOwnProfileValidator = [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/)
    .withMessage('El nombre solo puede contener letras, espacios, guiones y apóstrofes'),

  body('apellido')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El apellido debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/)
    .withMessage('El apellido solo puede contener letras, espacios, guiones y apóstrofes'),

  campoCorreo('correo'),

  body('telefono')
    .optional()
    .trim()
    .customSanitizer(sanitizarTelefono)
    .matches(/^\+57\d{10}$/)
    .withMessage('El teléfono debe iniciar con +57 y tener 10 dígitos numéricos'),
];

export const userIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('ID de usuario inválido'),
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

export const updateModoOscuroValidator = [
  body('modoOscuro')
    .isBoolean()
    .withMessage('modoOscuro debe ser true o false')
    .notEmpty()
    .withMessage('modoOscuro es obligatorio')
];

// el administrador cambia la contraseña de otro usuario: una nueva, o la cédula (restablecer)
export const cambiarContrasenaValidator = [
  param('id').isMongoId().withMessage('ID de usuario inválido'),
  body('restablecer').optional().isBoolean().withMessage('restablecer debe ser verdadero o falso').toBoolean(),
  body('exigirCambio').optional().isBoolean().withMessage('exigirCambio debe ser verdadero o falso').toBoolean(),
  body('contraseña')
    .if(body('restablecer').not().equals('true'))
    .isString().withMessage('La contraseña nueva es requerida').bail()
    .isLength({ min: 6, max: 100 }).withMessage('La contraseña debe tener entre 6 y 100 caracteres'),
];
