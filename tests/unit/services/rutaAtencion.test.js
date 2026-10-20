import { describe, it, expect } from 'vitest';
import { clasificarRuta, detectarAmbito } from '../../../src/services/ia/rutaAtencion.js';
import { DECRETO_1965_ART_40, LEY_1098_ART_44, FUENTES } from '../../../src/config/normasRutaAtencion.js';

describe('clasificación de ruta (Ley 1620 / Decreto 1965 / Ley 1098)', () => {
  it.each([
    // [texto, categoria, gravedad, ámbito, tipo]
    ['el profesor de música le tocó los senos a mi hija', 'abuso_sexual', 'grave', 'escolar', 'III'],
    ['un compañero lo amenazó con un cuchillo en el colegio', 'violencia_intrafamiliar', 'grave', 'escolar', 'III'],
    ['la profesora le dice bruto todos los días', 'maltrato_psicologico', 'moderado', 'escolar', 'II'],
    ['el profe le pegó y le quedó un morado', 'maltrato_fisico', 'moderado', 'escolar', 'II'],
    ['el profe le dijo estúpido en clase', 'maltrato_psicologico', 'moderado', 'escolar', 'I'],
    ['creo que abusaron de mi hija', 'abuso_sexual', 'grave', 'hogar', null],
    ['le pegué con la correa y le quedaron morados', 'maltrato_fisico', 'grave', 'hogar', null],
    ['a veces le pego con la chancla', 'maltrato_fisico', 'moderado', 'hogar', null],
    ['mi hija dice que se quiere morir', 'autolesion_suicidio', 'grave', 'personal', null],
    // el lugar no cambia el ámbito "personal"
    ['en el colegio dijo que se quería matar', 'autolesion_suicidio', 'grave', 'personal', null],
  ])('"%s" → %s/%s → %s, tipo %s', (texto, categoria, gravedad, ambito, tipo) => {
    const r = clasificarRuta({ categoria, gravedad, texto });
    expect(r.ambito).toBe(ambito);
    expect(r.tipoLey1620).toBe(tipo);
    expect(r.pendienteValidacion).toBe(true);
    expect(r.nota).toMatch(/Pendiente de validación por orientación\/convivencia/);
    expect(r.criterio).toBeTruthy();
    expect(r.protocolo).toBeTruthy();
  });

  it('el tipo Ley 1620 solo existe en el ámbito escolar', () => {
    for (const categoria of ['abuso_sexual', 'maltrato_fisico', 'violencia_intrafamiliar', 'negligencia_grave', 'autolesion_suicidio']) {
      for (const gravedad of ['grave', 'moderado']) {
        const r = clasificarRuta({ categoria, gravedad, texto: 'en la casa pasó esto' });
        expect(r.ambito).not.toBe('escolar');
        expect(r.tipoLey1620).toBeNull();
      }
    }
  });

  it('cada tipo escolar cita el numeral literal del art. 40 del Decreto 1965 con su fuente', () => {
    const casos = {
      I: { categoria: 'maltrato_psicologico', gravedad: 'moderado', texto: 'el profe le gritó una vez' },
      II: { categoria: 'maltrato_psicologico', gravedad: 'moderado', texto: 'el profe le grita todos los dias' },
      III: { categoria: 'abuso_sexual', gravedad: 'grave', texto: 'el profe la manoseó' },
    };
    for (const [tipo, caso] of Object.entries(casos)) {
      const r = clasificarRuta(caso);
      expect(r.tipoLey1620).toBe(tipo);
      const art40 = r.fundamento.find((f) => f.articulo.startsWith('Art. 40'));
      expect(art40).toMatchObject({ norma: 'Decreto 1965 de 2013', fuente: FUENTES.decreto1965.url, texto: DECRETO_1965_ART_40[tipo] });
    }
  });

  it('hogar grave: reporte a autoridades (Ley 1098, art. 44, num. 9); moderado: apoyo y orientación (num. 2)', () => {
    const grave = clasificarRuta({ categoria: 'maltrato_fisico', gravedad: 'grave', texto: 'le pegó y le salió sangre' });
    expect(grave.protocolo).toMatch(/ICBF/);
    expect(grave.fundamento[0]).toMatchObject({ articulo: 'Art. 44, num. 9', texto: LEY_1098_ART_44.num9, fuente: FUENTES.ley1098.url });

    const moderado = clasificarRuta({ categoria: 'negligencia_grave', gravedad: 'moderado', texto: 'no tenemos que comer' });
    expect(moderado.protocolo).toMatch(/apoyo y orientación/);
    expect(moderado.fundamento[0]).toMatchObject({ articulo: 'Art. 44, num. 2', texto: LEY_1098_ART_44.num2 });
  });

  it('riesgo suicida: el protocolo queda PENDIENTE de fuente oficial (no se inventa)', () => {
    const r = clasificarRuta({ categoria: 'autolesion_suicidio', gravedad: 'grave', texto: 'quiero morirme' });
    expect(r.protocolo).toMatch(/PENDIENTE de fuente oficial/);
    expect(r.fundamento).toEqual([]);
    expect(r.fuentePendiente).toMatch(/No se encontró/);
  });

  it('sin categoría de riesgo no hay ruta', () => {
    expect(clasificarRuta({ categoria: null, gravedad: null, texto: 'hola' })).toBeNull();
  });

  it('el ámbito escolar se reconoce por actor o lugar, no por palabras sueltas', () => {
    expect(detectarAmbito('maltrato_fisico', 'en el recreo le pegaron')).toBe('escolar');
    expect(detectarAmbito('maltrato_fisico', 'la coordinadora lo jaloneó')).toBe('escolar');
    expect(detectarAmbito('maltrato_fisico', 'mi esposo le pegó al niño')).toBe('hogar');
    expect(detectarAmbito('maltrato_fisico', 'le pegué porque no hizo la tarea del colegio')).toBe('hogar');
  });
});
