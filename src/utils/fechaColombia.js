// src/utils/fechaColombia.js

// Colombia es UTC-5 todo el año (no tiene horario de verano)
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

/**
 * Rango [inicio, fin) del día calendario de Bogotá que contiene `fecha`
 * (o el de hoy si no se pasa nada), como instantes UTC reales -- los
 * contenedores corren en UTC, así que un simple `setHours(0,0,0,0)` calcula
 * la medianoche del servidor, no la de Bogotá (5 horas de diferencia).
 */
export const rangoDiaBogota = (fecha = new Date()) => {
  const enBogota = new Date(fecha.getTime() - OFFSET_BOGOTA_MS);
  enBogota.setUTCHours(0, 0, 0, 0);
  const inicio = new Date(enBogota.getTime() + OFFSET_BOGOTA_MS);
  const fin    = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fin };
};

/** Igual, pero a partir de una fecha "YYYY-MM-DD" (ej. un query param) */
export const rangoDiaBogotaDesdeISO = (fechaISO) => {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1, dia, 5, 0, 0, 0)); // 00:00 Bogotá = 05:00 UTC
  const fin    = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fin };
};

/** Rango [inicio, fin) del mes calendario de Bogotá para `anio`/`mes` (mes: 1-12) */
export const rangoMesBogota = (anio, mes) => ({
  inicio: new Date(Date.UTC(anio, mes - 1, 1, 5, 0, 0, 0)),
  fin:    new Date(Date.UTC(anio, mes,     1, 5, 0, 0, 0)),
});
