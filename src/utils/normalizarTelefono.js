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

  let limpio = telefono.trim().replace(/[\s\-\(\)]/g, '');

  if (/^\+57\d{10}$/.test(limpio)) {
    return limpio;
  }

  if (/^57\d{10}$/.test(limpio)) {
    return `+${limpio}`;
  }

  if (/^3\d{9}$/.test(limpio)) {
    return `+57${limpio}`;
  }

  return null;
};