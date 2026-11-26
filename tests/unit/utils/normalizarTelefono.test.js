import { describe, it, expect } from 'vitest';
import { normalizarTelefono } from '../../../src/utils/normalizarTelefono.js';

describe('normalizarTelefono', () => {
  it('normaliza un número local de 10 dígitos que empieza en 3', () => {
    expect(normalizarTelefono('3005550199')).toBe('+573005550199');
  });

  it('deja igual un número que ya tiene +57 correcto', () => {
    expect(normalizarTelefono('+573005550199')).toBe('+573005550199');
  });

  it('agrega el + a un número con 57 sin el +', () => {
    expect(normalizarTelefono('573005550199')).toBe('+573005550199');
  });

  it('limpia espacios, guiones y paréntesis antes de normalizar', () => {
    expect(normalizarTelefono('  (300) 555-0199  ')).toBe('+573005550199');
  });

  it('devuelve null para un número que no empieza en 3', () => {
    expect(normalizarTelefono('2005550199')).toBeNull();
  });

  it('devuelve null para un número con menos de 10 dígitos', () => {
    expect(normalizarTelefono('30055501')).toBeNull();
  });

  it('devuelve null para un número con más de 10 dígitos locales', () => {
    expect(normalizarTelefono('300555019999')).toBeNull();
  });

  it('devuelve null para texto no numérico', () => {
    expect(normalizarTelefono('no-es-un-telefono')).toBeNull();
  });

  it('devuelve null para valores vacíos o falsy', () => {
    expect(normalizarTelefono('')).toBeNull();
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono(undefined)).toBeNull();
  });
});
