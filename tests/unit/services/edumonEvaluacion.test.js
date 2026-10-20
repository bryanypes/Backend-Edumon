import { describe, it, expect } from 'vitest';
import {
  evaluarRiesgo, hayIndicioDudoso, detectarTema, pideHacerTarea, extraerEdad, detectarCharla, requiereAtencion,
} from '../../../src/services/ia/reglas.js';
import { CASOS_EVALUACION } from '../../../src/data/casosEvaluacionEdumon.js';

// las reglas (modo simulado y red de seguridad) contra el set de evaluación;
// el LLM se mide aparte con `npm run eval:edumon`
const formato = (r) => (r ? `${r.categoria}:${r.gravedad}` : null);

describe('set de evaluación de Edumon (reglas)', () => {
  describe('riesgo', () => {
    it.each(CASOS_EVALUACION.map((c) => [c.texto, c]))('"%s"', (texto, c) => {
      if (c.dudoso) {
        // las reglas solas no deciden: no hay riesgo seguro, pero sí un indicio para el LLM
        expect(formato(evaluarRiesgo(texto))).toBeNull();
        expect(hayIndicioDudoso(texto)).toBe(true);
      } else {
        expect(formato(evaluarRiesgo(texto))).toBe(c.riesgo);
        if (!c.riesgo) expect(hayIndicioDudoso(texto)).toBe(false);
      }
    });
  });

  const conTema = CASOS_EVALUACION.filter((c) => c.subtema !== undefined && !c.soloLLM);
  it.each(conTema.map((c) => [c.texto, c.subtema]))('tema de "%s" = %s', (texto, subtema) => {
    expect([subtema].flat()).toContain(detectarTema(texto)?.subtema ?? null);
  });

  const conTarea = CASOS_EVALUACION.filter((c) => c.tarea !== undefined);
  it.each(conTarea.map((c) => [c.texto, c.tarea]))('¿pide hacer la tarea? "%s" = %s', (texto, tarea) => {
    expect(pideHacerTarea(texto)).toBe(tarea);
  });

  const conEdad = CASOS_EVALUACION.filter((c) => c.edad !== undefined);
  it.each(conEdad.map((c) => [c.texto, c.edad]))('edad de "%s" = %s', (texto, edad) => {
    expect(extraerEdad(texto)).toBe(edad);
  });

  const conCharla = CASOS_EVALUACION.filter((c) => c.charla !== undefined && !c.soloLLM);
  it.each(conCharla.map((c) => [c.texto, c.charla]))('charla de "%s" = %s', (texto, charla) => {
    expect(detectarCharla(texto)).toBe(charla);
  });

  const conAtencion = CASOS_EVALUACION.filter((c) => c.atencion);
  it.each(conAtencion.map((c) => [c.texto]))('atención en "%s"', (texto) => {
    expect(requiereAtencion(texto) || hayIndicioDudoso(texto)).toBe(true);
  });
});
