import { describe, it, expect } from 'vitest';
import { detectarCharla } from '../../../src/services/ia/reglas.js';
import { respuestaCharla } from '../../../src/services/ia/respuestasFijas.js';

// Sin IA (cuota agotada o modo simulado) estas frases caían en "no tengo información confiable"

describe('detectarCharla: preguntas sobre Edumon', () => {
  it.each([
    '¿En qué me puedes ayudar?',
    'en q me puedes ayudar',
    'qué puedes hacer',
    'Hola, ¿en qué me puedes ayudar?',
    '¿Quién eres?',
    '¿para qué sirves?',
    'cómo funcionas',
    'necesito ayuda',
    'de qué temas sabes',
  ])('"%s" → presentacion', (texto) => {
    expect(detectarCharla(texto)).toBe('presentacion');
  });

  it('la presentación dice qué hace Edumon e invita a contar el caso', () => {
    const r = respuestaCharla('presentacion');
    expect(r).toMatch(/Soy Edumon/);
    expect(r).toMatch(/pantallas/);
    expect(r).not.toMatch(/información confiable/);
  });
});

describe('detectarCharla: saludos reales', () => {
  it.each(['hola', 'Holaa', 'ola', 'buen día', 'Hola, ¿cómo estás?', 'hello', 'buenas noches Edumon', 'Edumon'])(
    '"%s" → saludo', (texto) => {
      expect(detectarCharla(texto)).toBe('saludo');
    },
  );
});

describe('detectarCharla: no confunde consultas con charla', () => {
  it.each([
    'hola, mi hijo no suelta el celular',
    'necesito ayuda porque mi hija no duerme',
    'gracias, pero no funcionó',
  ])('"%s" → null', (texto) => {
    expect(detectarCharla(texto)).toBeNull();
  });
});
