import { describe, it, expect } from 'vitest';
import { analizarRiesgo, evaluarRiesgo, requiereAtencion, detectarTema } from '../../../src/services/ia/reglas.js';
import { claveFonetica, distancia } from '../../../src/services/ia/ortografiaGrave.js';

const formato = (r) => (r ? `${r.categoria}:${r.gravedad}` : null);

describe('coincidencia aproximada solo para reglas GRAVE', () => {
  it.each([
    ['mi hijo quiere sucidarse', 'autolesion_suicidio:grave'],
    ['me kiero matar', 'autolesion_suicidio:grave'],
    ['ya no kiero vivir', 'autolesion_suicidio:grave'],
    ['ya no quiero bivir', 'autolesion_suicidio:grave'],
    ['hubo abuzo de mi hija', 'abuso_sexual:grave'],
    ['abusaron d mi niña', 'abuso_sexual:grave'],
    ['le dieron una golpisa', 'maltrato_fisico:grave'],
    ['me amenasa con matarme', 'violencia_intrafamiliar:grave'],
  ])('"%s" → %s', (texto, esperado) => {
    const { seguro } = analizarRiesgo(texto);
    expect(formato(seguro)).toBe(esperado);
    expect(seguro.aproximado).toBe(true);
    expect(seguro.correcciones.length).toBeGreaterThan(0);
  });

  it('con ortografía correcta no se marca como aproximado', () => {
    const { seguro } = analizarRiesgo('mi hija dice que se quiere morir');
    expect(seguro.aproximado).toBeUndefined();
  });

  // palabras comunes (bien o mal escritas) parecidas a las de las reglas graves
  it.each([
    'me kiero ir a dormir temprano',
    'la mata del jardín se secó',
    'toca ir al médico mañana',
    'le pegó el sol en la playa',
    'quemamos la basura del patio',
    'lo quemó el sol en el paseo',
    'se nos murió el perrito',
    'boy a ver si mañana puedo',
    'kiero aprender a cosinar con mi hija',
    'matamos el tiempo jugando parqués',
    'mi hija bive con su abuela',
    'el abuelo abusa del azúcar en el tinto',
    'mi hijo se corta el pelo solo',
    'quedo muy cansada después del trabajo',
    'la profe le puso una carita feliz',
    'tiene un amigo q se llama mateo',
    'el niño quedó morado de la risa',
    'mi hija ve videos de golf',
    'la tocaya de mi hija vino de visita',
    'el bolsillo del pantalón se rompió',
  ])('no alerta: "%s"', (texto) => {
    expect(formato(evaluarRiesgo(texto)) ?? 'sin riesgo').not.toMatch(/:grave$/);
  });

  it('las reglas moderadas, de atención y de tema NO usan la corrección', () => {
    // "correazos" mal escrito no se corrige: la red aproximada es solo para lo grave
    expect(evaluarRiesgo('le doy correasos')).toBeNull();
    expect(evaluarRiesgo('le doy correazos')).toMatchObject({ gravedad: 'moderado' });
    expect(requiereAtencion('estoy agotada')).toBe(true);
    expect(requiereAtencion('estoy agotda')).toBe(false);
    expect(detectarTema('no suelta el selular')).toBeNull();
  });

  it('clave fonética y distancia de edición', () => {
    expect(claveFonetica('kiero')).toBe(claveFonetica('quiero'));
    expect(claveFonetica('bivir')).toBe(claveFonetica('vivir'));
    expect(claveFonetica('cuchiyo')).toBe(claveFonetica('cuchillo'));
    expect(claveFonetica('golpisa')).toBe(claveFonetica('golpiza'));
    expect(distancia('sucid', 'suicid')).toBe(1);
    expect(distancia('abuso', 'abuso')).toBe(0);
    expect(distancia('ab', 'ba')).toBe(1);
  });
});
