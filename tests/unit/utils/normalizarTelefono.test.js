import { describe, it, expect } from 'vitest';
import { normalizarTelefono } from '../../../src/utils/normalizarTelefono.js';

describe('normalizarTelefono', () => {
  it('normaliza un número local de 10 dígitos que empieza en 3', () => {
    expect(normalizarTelefono('3113014875')).toBe('+573113014875');
  });

  it('deja igual un número que ya tiene +57 correcto', () => {
    expect(normalizarTelefono('+573113014875')).toBe('+573113014875');
  });

  it('agrega el + a un número con 57 sin el +', () => {
    expect(normalizarTelefono('573113014875')).toBe('+573113014875');
  });

  it('limpia espacios, guiones y paréntesis antes de normalizar', () => {
    expect(normalizarTelefono('  (311) 301-4875  ')).toBe('+573113014875');
  });

  it('devuelve null para un número que no empieza en 3', () => {
    expect(normalizarTelefono('2113014875')).toBeNull();
  });

  it('devuelve null para un número con menos de 10 dígitos', () => {
    expect(normalizarTelefono('31130148')).toBeNull();
  });

  it('devuelve null para un número con más de 10 dígitos locales', () => {
    expect(normalizarTelefono('311301487599')).toBeNull();
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
