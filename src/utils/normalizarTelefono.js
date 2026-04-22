// src/utils/normalizarTelefono.js

/**
 * Normaliza un número de teléfono colombiano al formato +57XXXXXXXXXX
 * Ejemplos:
 *   "3113014875"      → "+573113014875"
 *   "+573113014875"   → "+573113014875"
 *   "573113014875"    → "+573113014875"
 *   "3001112233"      → "+573001112233"
 */
export const normalizarTelefono = (telefono) => {
  if (!telefono) return null;

  // Limpiar espacios y caracteres no numéricos excepto el +
  let limpio = telefono.trim().replace(/[\s\-\(\)]/g, '');

  // Si ya tiene +57 correcto
  if (/^\+57\d{10}$/.test(limpio)) {
    return limpio;
  }

  // Si tiene 57 adelante sin el +
  if (/^57\d{10}$/.test(limpio)) {
    return `+${limpio}`;
  }

  // Si es solo el número local (10 dígitos empezando en 3)
  if (/^3\d{9}$/.test(limpio)) {
    return `+57${limpio}`;
  }

  // Número inválido
  return null;
};

/**
 * Valida si un teléfono colombiano es válido
 */
export const esTelefonoValido = (telefono) => {
  const normalizado = normalizarTelefono(telefono);
  return normalizado !== null;
};