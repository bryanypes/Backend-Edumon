import { describe, it, expect } from 'vitest';
import { evaluarRiesgo, hayIndicioDudoso } from '../../../src/services/ia/reglas.js';

// Categorías generales de riesgo GRAVE (mejora A2). Las frases de aquí son
// nuevas: no son las del conjunto original ni las del holdout.
const formato = (r) => (r ? `${r.categoria}:${r.gravedad}` : 'sin riesgo');
const grave = (categoria) => `${categoria}:grave`;

describe('categorías generales de riesgo grave', () => {
  describe('intención suicida sin la palabra', () => {
    it.each([
      'quiere dormirse y no despertar',
      'me dijo que ojalá no despertar nunca',
      'mi hija quiere desaparecer de este mundo',
      'dice que su familia estaría mejor sin él',
      'cree que todos estarían mejor sin mí',
    ])('alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).toBe(grave('autolesion_suicidio')));

    it.each([
      'me quiero morir de la risa con ese video',
      'se muere de la pena cuando habla en público',
      'nos morimos de hambre después del paseo',
      'mi primo es un suicida en la bicicleta',
      'se me murió el celular',
      'quiere desaparecer del grupo de whatsapp del curso',
      'no quiere despertarse temprano los sábados',
      'estaría mejor sin el celular en la noche',
      'mi hijo se mata de la risa con su hermano',
    ])('no alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).not.toMatch(/:grave$/));
  });

  describe('ingesta o método', () => {
    it.each([
      'se tomó un veneno para ratas',
      'mi hijo se tragó todas las pastillas de la abuela',
      'tomó cloro a propósito',
      'compró una soga para matarse',
    ])('alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).toBe(grave('autolesion_suicidio')));

    it.each([
      'se tomó la pastilla para la fiebre',
      'tomó acetaminofén para el dolor de cabeza',
      'usamos veneno para las cucarachas de la cocina',
      'se tomó las pastillas que le mandó el médico',
      'compré cloro para lavar el baño',
    ])('no alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).not.toMatch(/:grave$/));
  });

  describe('figura adulta que besa, toca o manosea', () => {
    it.each([
      'el conductor de la ruta la besa en la boca',
      'el vecino lo toca cuando están solos',
      'un señor la manoseó en el bus',
      'la catequista lo tocaba y le pedía secreto',
    ])('alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).toBe(grave('abuso_sexual')));

    it.each([
      'el profe toca guitarra en las izadas de bandera',
      'el vecino toca la puerta muy duro',
      'le toca a ella lavar los platos',
      'al entrenador le toca madrugar',
      'la profesora toca el timbre del recreo',
      'el señor de la tienda nos toca el pito cuando pasamos',
    ])('no alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).not.toMatch(/:grave$/));

    it('dentro de la familia "la toca" sigue siendo un indicio dudoso (lo confirma el LLM)', () => {
      expect(evaluarRiesgo('el abuelo la toca cuando están solos')).toBeNull();
      expect(hayIndicioDudoso('el abuelo la toca cuando están solos')).toBe(true);
    });
  });

  describe('grooming', () => {
    it.each([
      'un man le estuvo pidiendo fotos sin ropa en roblox',
      'le exigen videos íntimos por tiktok',
      'un adulto le pide packs en free fire',
      'le pidieron nudes por instagram',
    ])('alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).toBe(grave('abuso_sexual')));

    it.each([
      'le pidieron fotos del paseo para el álbum',
      'la profe pidió videos del experimento de ciencias',
      'mandó un pack de stickers al grupo',
      'compartió fotos del cumpleaños',
    ])('no alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).not.toMatch(/:grave$/));
  });

  describe('violencia física grave y armas', () => {
    it.each([
      ['su padrastro le partió la nariz', 'maltrato_fisico'],
      ['le pegaron a patadas en la casa', 'maltrato_fisico'],
      ['mi expareja me puso una navaja en la garganta', 'violencia_intrafamiliar'],
      ['me sacó un machete contra el pecho', 'violencia_intrafamiliar'],
      ['me ahorcó hasta que no pude respirar', 'violencia_intrafamiliar'],
      ['lo estranguló con el cinturón', 'maltrato_fisico'],
      ['mi esposo me puso el rebolver en la cabeza', 'violencia_intrafamiliar'],
    ])('alerta: "%s" → %s', (t, categoria) => expect(formato(evaluarRiesgo(t))).toBe(grave(categoria)));

    it.each([
      'se partió la boca jugando fútbol',
      'le rompió la nariz al muñeco de nieve',
      'un compañero le dio a patadas en el recreo',
      'puso el cuchillo en la mesa para cortar el pastel',
      'me ahorcó de risa con sus chistes',
      'le abrió la cabeza a la piñata',
      'el niño se volteó la cara para no comer',
    ])('no alerta: "%s"', (t) => expect(formato(evaluarRiesgo(t))).not.toMatch(/:grave$/));
  });
});
