import { describe, it, expect, vi } from 'vitest';
import { normalizeMultipartArrays } from '../../../src/middlewares/normalizeMultipartArrays.js';

const ejecutar = (body, campos) => {
  const req = { body };
  const res = {};
  const next = vi.fn();
  normalizeMultipartArrays(campos)(req, res, next);
  return { req, next };
};

describe('normalizeMultipartArrays', () => {
  it('parsea un campo que llega como string JSON de un array', () => {
    const { req, next } = ejecutar({ enlaces: '[{"url":"http://x.com"}]' }, ['enlaces']);
    expect(req.body.enlaces).toEqual([{ url: 'http://x.com' }]);
    expect(next).toHaveBeenCalledOnce();
  });

  it('deja el campo intacto si no es string (ej. ya es array por express.json())', () => {
    const original = [{ url: 'http://x.com' }];
    const { req } = ejecutar({ enlaces: original }, ['enlaces']);
    expect(req.body.enlaces).toBe(original);
  });

  it('deja el string intacto si no es JSON válido (el validador lo rechazará después)', () => {
    const { req, next } = ejecutar({ enlaces: 'no-es-json' }, ['enlaces']);
    expect(req.body.enlaces).toBe('no-es-json');
    expect(next).toHaveBeenCalledOnce();
  });

  it('ignora campos ausentes en el body sin lanzar error', () => {
    const { req, next } = ejecutar({}, ['enlaces', 'etiquetas']);
    expect(req.body.enlaces).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('procesa varios campos declarados de forma independiente', () => {
    const { req } = ejecutar(
      { enlaces: '["a","b"]', etiquetas: '["x"]', criterios: 'texto plano' },
      ['enlaces', 'etiquetas', 'criterios'],
    );
    expect(req.body.enlaces).toEqual(['a', 'b']);
    expect(req.body.etiquetas).toEqual(['x']);
    expect(req.body.criterios).toBe('texto plano');
  });
});
