import validator from 'validator';

// Reglas únicas de correo para el modelo y todos los validadores de rutas.
//
// Antes el modelo usaba /^\w+([.-]?\w+)*@.../: cuantificadores anidados con
// backtracking exponencial. Un texto de ~35 caracteres sin dominio bloqueaba el
// servidor varios segundos (y a todos los usuarios con él). Este patrón no tiene
// cuantificadores ambiguos: cada parte del dominio empieza por un punto, así que
// el tiempo de evaluación es lineal.
const PATRON_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;
export const CORREO_MAX = 254;

/** "  Maria.Perez@Gmail.com " → "maria.perez@gmail.com"; vacío → undefined. No quita puntos ni "+". */
export function normalizarCorreo(valor) {
  if (typeof valor !== 'string') return valor;
  const limpio = valor.trim().toLowerCase();
  return limpio || undefined;
}

export function esCorreoValido(valor) {
  return typeof valor === 'string' && valor.length <= CORREO_MAX && PATRON_CORREO.test(valor);
}

/**
 * Formas con las que un correo puede estar guardado. Hasta octubre de 2026 algunas
 * rutas aplicaban normalizeEmail() (en Gmail quita puntos y "+etiqueta"), así que una
 * cuenta pudo quedar como "mariaperez@gmail.com" aunque la persona escriba "maria.perez@gmail.com".
 */
export function formasDeCorreo(valor) {
  const normal = normalizarCorreo(valor);
  if (!normal) return [];
  const antigua = validator.normalizeEmail(normal) || normal;
  return [...new Set([normal, antigua])];
}

/**
 * Correos de relleno que el sistema genera cuando la persona no tiene uno:
 * "<cédula>@temp.com" (padres y docentes) y "<cédula>@<código del colegio>.edu"
 * (administradores). No existen: enviarles correo solo demora la notificación y
 * daña la reputación del remitente.
 */
export function esCorreoFicticio(valor) {
  const c = normalizarCorreo(valor);
  return !c || /@temp\.com$/.test(c) || /@edu-[a-z0-9]+\.edu$/.test(c);
}
