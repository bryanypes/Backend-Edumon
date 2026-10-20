import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  completar, classify, respond, stream, iaDisponible, estadoProveedores, registrarProveedoresAlArrancar,
  configuracionIA, ErrorIA, _reiniciarEstadoIA,
} from '../../../src/services/ia/proveedorIA.js';
import { clasificar, _limpiarCacheClasificaciones } from '../../../src/services/ia/clasificador.js';
import {
  stubProveedores, configurarLlaves, guardarEntorno, respuestaOk, respuestaError, sinRespuesta,
  LLAVES_FALSAS, CLASIFICACION_NORMAL, responderSegunSchema,
} from '../../helpers/proveedoresFalsos.js';

const OPCIONES = { system: 's', messages: [{ role: 'user', content: 'hola' }], schema: { type: 'object' }, nombre: 'prueba' };
const OK = { ok: true };

describe('capa de proveedores de IA', () => {
  let restaurar;
  beforeEach(() => {
    restaurar = guardarEntorno();
    _reiniciarEstadoIA();
    _limpiarCacheClasificaciones();
    delete process.env.LLM_PROVIDER_ORDER;
    delete process.env.LLM_TIMEOUT_MS;
    delete process.env.LLM_COOLDOWN_SECONDS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { restaurar(); vi.restoreAllMocks(); });

  describe('orden configurable', () => {
    it('por defecto usa groq primero', async () => {
      configurarLlaves();
      const { llamadasA } = stubProveedores({ groq: () => respuestaOk(OK), openai: () => respuestaOk(OK) });
      const r = await completar(OPCIONES);
      expect(r.proveedor).toBe('groq');
      expect(r.huboFallback).toBe(false);
      expect(llamadasA('openai')).toBe(0);
    });

    it('LLM_PROVIDER_ORDER="openai,groq" invierte el orden sin tocar código', async () => {
      configurarLlaves();
      process.env.LLM_PROVIDER_ORDER = 'openai,groq';
      const { llamadasA } = stubProveedores({ groq: () => respuestaOk(OK), openai: () => respuestaOk(OK) });
      const r = await completar(OPCIONES);
      expect(r.proveedor).toBe('openai');
      expect(r.modelo).toBe(process.env.OPENAI_MODEL || 'gpt-4.1-mini');
      expect(llamadasA('groq')).toBe(0);
    });

    it('ignora nombres desconocidos y duplicados en el orden', () => {
      process.env.LLM_PROVIDER_ORDER = ' OpenAI , foo, openai,groq ';
      expect(configuracionIA().orden).toEqual(['openai', 'groq']);
    });
  });

  describe('fallback', () => {
    it.each([
      [429, 'rate_limit'],
      [401, 'auth'],
      [403, 'auth'],
      [500, 'servidor'],
      [503, 'servidor'],
    ])('con %i pasa al siguiente proveedor', async (status, tipo) => {
      configurarLlaves();
      stubProveedores({ groq: () => respuestaError(status), openai: () => respuestaOk(OK) });
      const r = await completar(OPCIONES);
      expect(r.proveedor).toBe('openai');
      expect(r.huboFallback).toBe(true);
      expect(r.intentos).toEqual([expect.objectContaining({ proveedor: 'groq', tipo, status })]);
    });

    it('con timeout (LLM_TIMEOUT_MS) pasa al siguiente proveedor', async () => {
      configurarLlaves();
      process.env.LLM_TIMEOUT_MS = '50';
      stubProveedores({ groq: (_, opciones) => sinRespuesta(opciones), openai: () => respuestaOk(OK) });
      const r = await completar(OPCIONES);
      expect(r.proveedor).toBe('openai');
      expect(r.intentos[0]).toMatchObject({ proveedor: 'groq', tipo: 'timeout' });
      // un timeout no pone en cooldown
      expect(estadoProveedores().proveedores.find((p) => p.nombre === 'groq').estado).toBe('activo');
    });

    it('si todos fallan lanza ErrorIA con los intentos', async () => {
      configurarLlaves();
      stubProveedores({ groq: () => respuestaError(500), openai: () => respuestaError(502) });
      const error = await completar(OPCIONES).catch((e) => e);
      expect(error).toBeInstanceOf(ErrorIA);
      expect(error.intentos.map((i) => i.proveedor)).toEqual(['groq', 'openai']);
    });
  });

  describe('cooldown', () => {
    it.each([429, 401])('tras un %i el proveedor se salta sin volver a llamarlo', async (status) => {
      configurarLlaves();
      const { llamadasA } = stubProveedores({ groq: () => respuestaError(status), openai: () => respuestaOk(OK) });

      await completar(OPCIONES);
      const segunda = await completar(OPCIONES);
      expect(llamadasA('groq')).toBe(1);
      expect(segunda.proveedor).toBe('openai');
      expect(segunda.intentos[0]).toMatchObject({ proveedor: 'groq', resultado: 'omitido_cooldown' });

      const groq = estadoProveedores().proveedores.find((p) => p.nombre === 'groq');
      expect(groq.estado).toBe('en_cooldown');
      expect(groq.cooldownRestanteSegundos).toBeGreaterThan(0);
      expect(groq.cooldownRestanteSegundos).toBeLessThanOrEqual(60);
    });

    it('un 5xx no pone en cooldown: el siguiente mensaje vuelve a intentar', async () => {
      configurarLlaves();
      const { llamadasA } = stubProveedores({ groq: () => respuestaError(500), openai: () => respuestaOk(OK) });
      await completar(OPCIONES);
      await completar(OPCIONES);
      expect(llamadasA('groq')).toBe(2);
    });

    it('al vencer LLM_COOLDOWN_SECONDS el proveedor vuelve a usarse', async () => {
      configurarLlaves();
      process.env.LLM_COOLDOWN_SECONDS = '0.05';
      let groqFalla = true;
      stubProveedores({ groq: () => (groqFalla ? respuestaError(429) : respuestaOk(OK)), openai: () => respuestaOk(OK) });
      await completar(OPCIONES);
      groqFalla = false;
      await new Promise((ok) => { setTimeout(ok, 80); });
      expect((await completar(OPCIONES)).proveedor).toBe('groq');
    });
  });

  describe('proveedor sin llave', () => {
    it('se omite sin error y responde el que sí tiene', async () => {
      configurarLlaves({ groq: false, openai: true });
      const { llamadasA } = stubProveedores({ groq: () => respuestaOk(OK), openai: () => respuestaOk(OK) });
      const r = await completar(OPCIONES);
      expect(r.proveedor).toBe('openai');
      expect(r.huboFallback).toBe(false);
      expect(llamadasA('groq')).toBe(0);
      expect(estadoProveedores().proveedores.find((p) => p.nombre === 'groq').estado).toBe('sin_llave');
    });

    it('sin ninguna llave: modo simulado y ErrorIA sin llamar a nadie', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { mock } = stubProveedores({});
      expect(iaDisponible()).toBe(false);
      expect(estadoProveedores().modo).toBe('simulado');
      await expect(completar(OPCIONES)).rejects.toThrow('No hay proveedor de IA configurado');
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe('las llaves nunca salen', () => {
    it('ni en los errores ni en el estado ni en el log de arranque', async () => {
      configurarLlaves();
      stubProveedores({
        groq: () => respuestaError(401, `Incorrect API key provided: ${LLAVES_FALSAS.groq}`),
        openai: () => respuestaError(500, `fallo con ${LLAVES_FALSAS.openai}`),
      });
      const error = await completar(OPCIONES).catch((e) => e);
      const log = [];
      registrarProveedoresAlArrancar((linea) => log.push(linea));
      const todo = JSON.stringify([error.message, error.intentos, estadoProveedores(), log]);

      expect(todo).not.toContain(LLAVES_FALSAS.groq);
      expect(todo).not.toContain(LLAVES_FALSAS.openai);
      expect(log[0]).toMatch(/1\. groq .*2\. openai/);
    });

    it('el log de arranque avisa el modo simulado', () => {
      configurarLlaves({ groq: false, openai: false });
      const log = [];
      expect(registrarProveedoresAlArrancar((l) => log.push(l))).toEqual([]);
      expect(log[0]).toMatch(/modo simulado/);
    });
  });

  describe('interfaz', () => {
    it('classify, respond y stream usan la misma cadena de proveedores', async () => {
      configurarLlaves({ groq: false });
      stubProveedores({ openai: () => respuestaOk(OK) });
      expect((await classify(OPCIONES)).datos).toEqual(OK);
      expect((await respond(OPCIONES)).datos).toEqual(OK);
      const fragmentos = [];
      for await (const f of stream(OPCIONES)) fragmentos.push(f);
      expect(fragmentos).toEqual([expect.objectContaining({ tipo: 'completo', datos: OK, proveedor: 'openai' })]);
    });
  });

  describe('clasificador', () => {
    it('guarda proveedor, latencia y fallback en la detección', async () => {
      configurarLlaves();
      stubProveedores({ groq: () => respuestaError(429), openai: responderSegunSchema });
      const r = await clasificar('mi hijo de 9 no suelta el celular');
      expect(r.fuente).toBe('ia');
      expect(r.deteccion).toMatchObject({ proveedor: 'openai', huboFallback: true, proveedoresFallidos: ['groq'], desdeCache: false });
      expect(r.deteccion.latenciaMs).toBeGreaterThanOrEqual(0);
      expect(r.tema).toEqual({ eje: CLASIFICACION_NORMAL.eje, subtema: CLASIFICACION_NORMAL.subtema });
    });

    it('si todos fallan usa reglas y lo deja registrado (no en silencio)', async () => {
      configurarLlaves();
      stubProveedores({ groq: () => respuestaError(503), openai: () => respuestaError(401) });
      const r = await clasificar('mi hija dice que se quiere morir');
      expect(r.fuente).toBe('reglas');
      expect(r.huboFallback).toBe(true);
      expect(r.categoriaRiesgo).toBe('autolesion_suicidio');
      expect(r.deteccion).toMatchObject({ fuente: 'reglas', huboFallback: true, proveedoresFallidos: ['groq', 'openai'] });
      expect(r.deteccion.errorIA).toBeTruthy();
    });

    it('cachea la clasificación por mensaje normalizado (con TTL)', async () => {
      configurarLlaves({ groq: false });
      const { llamadasA } = stubProveedores({ openai: responderSegunSchema });
      await clasificar('Mi hijo no suelta el CELULAR');
      const segunda = await clasificar('  mi hijo no suelta el celular ');
      expect(llamadasA('openai')).toBe(1);
      expect(segunda.deteccion.desdeCache).toBe(true);
    });

    it('la caché vence con LLM_CACHE_TTL_SECONDS', async () => {
      configurarLlaves({ groq: false });
      process.env.LLM_CACHE_TTL_SECONDS = '0.05';
      const { llamadasA } = stubProveedores({ openai: responderSegunSchema });
      await clasificar('mi hijo no suelta el celular');
      await new Promise((ok) => { setTimeout(ok, 80); });
      await clasificar('mi hijo no suelta el celular');
      expect(llamadasA('openai')).toBe(2);
    });

    it('no cachea un respaldo por reglas', async () => {
      configurarLlaves({ groq: false });
      let falla = true;
      stubProveedores({ openai: (b) => (falla ? respuestaError(500) : responderSegunSchema(b)) });
      expect((await clasificar('mi hijo no suelta el celular')).fuente).toBe('reglas');
      falla = false;
      expect((await clasificar('mi hijo no suelta el celular')).fuente).toBe('ia');
    });
  });
});

describe('URL base configurable', () => {
  it('GROQ_BASE_URL / OPENAI_BASE_URL cambian el destino; vacías usan la API oficial', async () => {
    const restaurar = guardarEntorno();
    _reiniciarEstadoIA();
    try {
      configurarLlaves({ groq: false });
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';
      const original = globalThis.fetch;
      const mock = vi.fn(async () => respuestaOk(OK));
      vi.stubGlobal('fetch', mock);
      await completar(OPCIONES);
      expect(String(mock.mock.calls[0][0])).toBe('http://127.0.0.1:9/v1/chat/completions');
      process.env.OPENAI_BASE_URL = '';
      await completar(OPCIONES);
      expect(String(mock.mock.calls[1][0])).toBe('https://api.openai.com/v1/chat/completions');
      vi.stubGlobal('fetch', original);
    } finally {
      delete process.env.OPENAI_BASE_URL;
      restaurar();
    }
  });
});

describe('datos de la cuenta del proveedor', () => {
  it('el id de organización que repite el proveedor en un 429 no sale en errores ni estado', async () => {
    const restaurar = guardarEntorno();
    _reiniciarEstadoIA();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      configurarLlaves({ openai: false });
      stubProveedores({ groq: () => respuestaError(429, 'Rate limit reached in organization `org_01abcdefghijklmn` service tier `on_demand`') });
      const error = await completar(OPCIONES).catch((e) => e);
      const todo = JSON.stringify([error.message, error.intentos, estadoProveedores()]);
      expect(todo).not.toContain('org_01abcdefghijklmn');
      expect(todo).toContain('[organizacion]');
    } finally {
      restaurar();
      vi.restoreAllMocks();
    }
  });
});
