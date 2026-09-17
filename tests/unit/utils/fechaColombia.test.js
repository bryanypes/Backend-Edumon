import { describe, it, expect } from 'vitest';
import { rangoDiaBogota, rangoDiaBogotaDesdeISO, rangoMesBogota } from '../../../src/utils/fechaColombia.js';

describe('rangoDiaBogota', () => {
  it('la medianoche de Bogotá (UTC-5) es las 05:00 UTC, no las 00:00 UTC del servidor', () => {
    // 10am UTC == 5am Bogotá del mismo día
    const { inicio, fin } = rangoDiaBogota(new Date('2026-03-10T10:00:00.000Z'));
    expect(inicio.toISOString()).toBe('2026-03-10T05:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-03-11T05:00:00.000Z');
  });

  it('las 3am UTC (10pm Bogotá del día anterior) todavía cuentan como el día de Bogotá anterior', () => {
    const { inicio, fin } = rangoDiaBogota(new Date('2026-03-10T03:00:00.000Z'));
    expect(inicio.toISOString()).toBe('2026-03-09T05:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-03-10T05:00:00.000Z');
  });
});

describe('rangoDiaBogotaDesdeISO', () => {
  it('convierte "YYYY-MM-DD" al rango [00:00, 24:00) de Bogotá en UTC', () => {
    const { inicio, fin } = rangoDiaBogotaDesdeISO('2026-03-10');
    expect(inicio.toISOString()).toBe('2026-03-10T05:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-03-11T05:00:00.000Z');
  });
});

describe('rangoMesBogota', () => {
  it('cubre desde el día 1 00:00 Bogotá hasta el día 1 00:00 Bogotá del mes siguiente', () => {
    const { inicio, fin } = rangoMesBogota(2026, 3);
    expect(inicio.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-04-01T05:00:00.000Z');
  });

  it('cruza el año correctamente en diciembre', () => {
    const { inicio, fin } = rangoMesBogota(2026, 12);
    expect(inicio.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(fin.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });
});
