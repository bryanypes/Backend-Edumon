// Traduce los errores de MongoDB/Mongoose que provoca el dato que envió la persona
// (formato inválido, valor repetido) a una respuesta clara, en vez de un 500
// "Error interno del servidor" que no dice qué corregir.

const CAMPOS_UNICOS = {
  correo: 'Ya existe un usuario con este correo electrónico',
  telefono: 'Ya existe un usuario con este teléfono',
  cedula: 'Ya existe un usuario con esta cédula',
};

/** @returns {{ status: number, body: object } | null} null si no es un error de datos */
export function errorDeDatos(error) {
  if (error?.name === 'ValidationError') {
    const primero = Object.values(error.errors ?? {})[0];
    return { status: 400, body: { message: primero?.message || 'Revisa los datos ingresados' } };
  }
  if (error?.name === 'CastError') {
    return { status: 400, body: { message: `El campo ${error.path} tiene un formato inválido` } };
  }
  if (error?.code === 11000) {
    const campo = Object.keys(error.keyPattern ?? error.keyValue ?? {})[0];
    return { status: 409, body: { message: CAMPOS_UNICOS[campo] || 'Ya existe un registro con esos datos' } };
  }
  return null;
}

/** Responde el error de datos si lo es; si no, devuelve false para que el llamador responda 500. */
export function responderErrorDeDatos(res, error) {
  const e = errorDeDatos(error);
  if (!e) return false;
  res.status(e.status).json(e.body);
  return true;
}

/**
 * Un correo vacío significa "quitar el correo". Guardar "" chocaría con el índice
 * único (dos usuarios sin correo tendrían el mismo valor ""), así que se hace $unset.
 */
export function conCorreoVacioComoUnset(datos) {
  if (!('correo' in datos) || (datos.correo !== '' && datos.correo !== null)) return datos;
  const { correo, ...resto } = datos; // eslint-disable-line no-unused-vars
  return { ...resto, $unset: { ...(resto.$unset ?? {}), correo: 1 } };
}
