import { describe, it, expect } from 'vitest';
import { parseJSONArray } from '../../../src/utils/parseJSONArray.js';

describe('parseJSONArray', () => {
  it('devuelve el mismo array si ya es un array', () => {
    const arr = [1, 2, 3];
    expect(parseJSONArray(arr)).toBe(arr);
  });

  it('envuelve un objeto plano en un array de un elemento', () => {
    expect(parseJSONArray({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it('parsea un string JSON que representa un array', () => {
    expect(parseJSONArray('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parsea un string JSON que representa un objeto y lo envuelve en array', () => {
    expect(parseJSONArray('{"url":"http://x.com"}')).toEqual([{ url: 'http://x.com' }]);
  });

  it('devuelve array vacío para un string que no es JSON válido', () => {
    expect(parseJSONArray('esto no es json')).toEqual([]);
  });

  it('devuelve array vacío para un string vacío o solo espacios', () => {
    expect(parseJSONArray('')).toEqual([]);
    expect(parseJSONArray('   ')).toEqual([]);
  });

  it('devuelve array vacío para undefined/null', () => {
    expect(parseJSONArray(undefined)).toEqual([]);
    expect(parseJSONArray(null)).toEqual([]);
  });

  it('devuelve array vacío para un string JSON que representa un número o boolean', () => {
    expect(parseJSONArray('42')).toEqual([]);
    expect(parseJSONArray('true')).toEqual([]);
  });
});
