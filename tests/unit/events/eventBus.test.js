import { describe, it, expect, vi, afterEach } from 'vitest';
import { eventBus } from '../../../src/events/EventBus.js';

describe('EventBus (patrón Observer)', () => {
  afterEach(() => {
    eventBus.removeAllListeners();
  });

  it('publicar() llama a todos los observers suscritos al mismo evento, con los datos publicados', async () => {
    const observerA = vi.fn();
    const observerB = vi.fn();
    eventBus.suscribir('evento.prueba', observerA);
    eventBus.suscribir('evento.prueba', observerB);

    eventBus.publicar('evento.prueba', { valor: 42 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(observerA).toHaveBeenCalledWith({ valor: 42 });
    expect(observerB).toHaveBeenCalledWith({ valor: 42 });
  });

  it('un observer solo reacciona al evento al que está suscrito', async () => {
    const observer = vi.fn();
    eventBus.suscribir('evento.a', observer);

    eventBus.publicar('evento.b', {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(observer).not.toHaveBeenCalled();
  });

  it('publicar sin observers suscritos no lanza error', () => {
    expect(() => eventBus.publicar('evento.sin.observers', {})).not.toThrow();
  });

  it('si un handler async rechaza, no rompe el proceso ni bloquea a los demás handlers', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlerQueFalla = vi.fn(async () => { throw new Error('boom'); });
    const handlerQueFunciona = vi.fn();

    eventBus.suscribir('evento.con.error', handlerQueFalla);
    eventBus.suscribir('evento.con.error', handlerQueFunciona);

    eventBus.publicar('evento.con.error', {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(handlerQueFalla).toHaveBeenCalled();
    expect(handlerQueFunciona).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('desuscribir() NO detiene las notificaciones si se le pasa el handler original — suscribir() lo envuelve en un wrapper async antes de registrarlo, así que off(evento, handlerOriginal) no encuentra esa referencia y no remueve nada', async () => {
    const observer = vi.fn();
    eventBus.suscribir('evento.desuscribir', observer);

    eventBus.desuscribir('evento.desuscribir', observer);

    eventBus.publicar('evento.desuscribir', {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(observer).toHaveBeenCalled();
  });

  it('la única forma efectiva de dejar de escuchar un evento es removeAllListeners()', async () => {
    const observer = vi.fn();
    eventBus.suscribir('evento.desuscribir2', observer);
    eventBus.removeAllListeners('evento.desuscribir2');

    eventBus.publicar('evento.desuscribir2', {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(observer).not.toHaveBeenCalled();
  });
});
