import { body } from 'express-validator';
import { esCorreoValido } from '../../utils/correo.js';

/**
 * Regla única para campos de correo: recorta espacios (el autocompletar del celular
 * agrega uno al final), pasa a minúsculas y valida con la misma regla del modelo.
 * Ya no usa normalizeEmail(): en Gmail quitaba puntos y "+etiqueta" y guardaba un
 * correo distinto al que escribió la persona.
 *
 * requerido: false → vacío se acepta y significa "sin correo".
 */
export const campoCorreo = (campo = 'correo', {
  requerido = false,
  mensaje = 'El correo electrónico no es válido',
  mensajeRequerido = 'El correo es requerido',
} = {}) => {
  const regla = body(campo);
  if (!requerido) {
    return regla
      .optional({ values: 'null' })
      .isString().withMessage(mensaje).bail()
      .trim()
      .toLowerCase()
      .custom((v) => v === '' || esCorreoValido(v)).withMessage(mensaje);
  }
  return regla
    .isString().withMessage(mensajeRequerido).bail()
    .trim()
    .notEmpty().withMessage(mensajeRequerido).bail()
    .toLowerCase()
    .custom(esCorreoValido).withMessage(mensaje);
};
