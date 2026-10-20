import { describe, it, expect } from 'vitest';
import { armarRecursos, esBusquedaAcademica } from '../../../src/services/ia/generador.js';

describe('recursos recomendados por Edumon', () => {
  it.each(['enseñar a sumar 5 años', 'Cómo enseñar matemáticas en casa', 'fracciones para niños', 'aprender inglés jugando'])(
    'descarta búsquedas académicas: "%s"', (texto) => {
      expect(esBusquedaAcademica(texto)).toBe(true);
    },
  );

  it.each(['rutina para hacer tareas sin peleas', 'cómo manejar la frustración con las tareas', 'loncheras saludables'])(
    'permite búsquedas de acompañamiento: "%s"', (texto) => {
      expect(esBusquedaAcademica(texto)).toBe(false);
    },
  );

  it('los artículos se buscan sin operadores "site:" visibles para la familia', () => {
    const [articulo] = armarRecursos([], [{ tipo: 'articulo', titulo: 'Acompañar el estudio', consulta: 'acompañar tareas en casa' }]);
    expect(decodeURIComponent(articulo.url)).not.toMatch(/site:/);
    expect(decodeURIComponent(articulo.url)).toMatch(/acompañar tareas en casa UNICEF/);
  });

  it('nunca deja pasar una búsqueda académica aunque la IA la proponga', () => {
    const recursos = armarRecursos([], [
      { tipo: 'articulo', titulo: 'Sumar jugando', consulta: 'enseñar a sumar 5 años' },
      { tipo: 'video', titulo: 'Rutina de tareas', consulta: 'rutina para hacer tareas sin peleas' },
    ]);
    expect(recursos).toHaveLength(1);
    expect(recursos[0].titulo).toBe('Rutina de tareas');
  });
});
