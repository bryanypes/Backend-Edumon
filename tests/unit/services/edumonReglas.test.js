import { describe, it, expect } from 'vitest';
import { detectarRiesgo, evaluarRiesgo, requiereAtencion, detectarTema, extraerEdad, normalizar } from '../../../src/services/ia/reglas.js';

describe('reglas de Edumon', () => {
  it('normaliza tildes y mayúsculas', () => {
    expect(normalizar('  Mi HIJA  no QUIERE ir al Colegio ')).toBe('mi hija no quiere ir al colegio');
  });

  it.each([
    ['Mi hijo dice que se quiere morir', 'autolesion_suicidio'],
    ['creo que abusaron de mi niña', 'abuso_sexual'],
    ['mi esposo me pega delante de los niños', 'violencia_intrafamiliar'],
    ['le di una paliza anoche', 'maltrato_fisico'],
  ])('detecta riesgo en "%s"', (texto, categoria) => {
    expect(detectarRiesgo(texto)).toBe(categoria);
  });

  it('no marca como riesgo una consulta cotidiana', () => {
    expect(detectarRiesgo('mi hijo no quiere hacer las tareas')).toBeNull();
  });

  it.each([
    'a veces le pego con la chancla',
    'le doy con la correa cuando no hace caso',
    'le pego con el cuero a mi hijo',
  ])('el castigo físico es maltrato físico, no abuso sexual: "%s"', (texto) => {
    expect(detectarRiesgo(texto)).toBe('maltrato_fisico');
  });

  it.each([
    ['le pego con la chancla', 'moderado'],
    ['mi esposo me pega', 'moderado'],
    ['lo encierro en el cuarto', 'moderado'],
    ['le di una paliza y le dejé marcas', 'grave'],
    ['mi esposo me amenaza con matar', 'grave'],
    ['creo que abusaron de mi hija', 'grave'],
    ['mi hija dice que se quiere morir', 'grave'],
  ])('gravedad de "%s" = %s', (texto, gravedad) => {
    expect(evaluarRiesgo(texto).gravedad).toBe(gravedad);
  });

  it('que a un niño le peguen en el colegio no es maltrato de la familia', () => {
    expect(detectarRiesgo('a mi hijo le pegan en el colegio')).toBeNull();
  });

  it('preguntar si pegar está bien es atención, no riesgo', () => {
    const texto = '¿está bien pegarle cuando se porta mal?';
    expect(detectarRiesgo(texto)).toBeNull();
    expect(requiereAtencion(texto)).toBe(true);
  });

  it('detecta el tema y su eje del Decreto 459', () => {
    expect(detectarTema('no suelta el celular')).toEqual({ eje: 'estilos_vida_saludable', subtema: 'pantallas' });
    expect(detectarTema('le hacen matoneo en el salón')).toEqual({ eje: 'garantia_derechos', subtema: 'acoso_escolar' });
    expect(detectarTema('¿qué opinas del fútbol?')).toBeNull();
  });

  it.each([
    ['mi hija de 13 años', 13],
    ['tiene 8', 8],
    ['9', 9],
    ['mi hijo es grande', null],
  ])('extrae la edad de "%s"', (texto, edad) => {
    expect(extraerEdad(texto)).toBe(edad);
  });
});
