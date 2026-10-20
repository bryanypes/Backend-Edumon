import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import Institucion from '../../src/models/Institucion.js';
import ConversacionIA from '../../src/models/ConversacionIA.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { _reiniciarEstadoIA } from '../../src/services/ia/proveedorIA.js';
import { _limpiarCacheClasificaciones } from '../../src/services/ia/clasificador.js';
import {
  crearPadre, crearDocente, crearAdministrador, crearSuperadmin, crearInstitucion,
} from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import {
  stubProveedores, configurarLlaves, guardarEntorno, respuestaError, responderSegunSchema, LLAVES_FALSAS,
} from '../helpers/proveedoresFalsos.js';

const prepararFamilia = async (app) => {
  const institucion = await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: institucion._id });
  await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
  const padre = await crearPadre({ institucionId: institucion._id });
  const agent = await loginComo(app, padre);
  await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
  const { body } = await agent.post('/api/ia/conversaciones');
  return { admin, agent, url: `/api/ia/conversaciones/${body.conversacion._id}/mensajes`, conversacionId: body.conversacion._id };
};

describe('Proveedores de IA en la API', () => {
  let app;
  let restaurar;
  beforeEach(async () => {
    restaurar = guardarEntorno();
    _reiniciarEstadoIA();
    _limpiarCacheClasificaciones();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ app } = crearApp());
    await cargarFichas();
  });
  afterEach(() => { restaurar(); vi.restoreAllMocks(); });

  describe('GET /api/ia/health', () => {
    it('el administrador ve el estado de cada proveedor (sin llaves)', async () => {
      configurarLlaves({ groq: true, openai: false });
      const institucion = await crearInstitucion();
      const admin = await crearAdministrador({ institucionId: institucion._id });
      const agent = await loginComo(app, admin);

      const res = await agent.get('/api/ia/health');
      expect(res.status).toBe(200);
      expect(res.body.modo).toBe('llm');
      expect(res.body.orden).toEqual(['groq', 'openai']);
      const porNombre = Object.fromEntries(res.body.proveedores.map((p) => [p.nombre, p]));
      expect(porNombre.groq).toMatchObject({ estado: 'activo', orden: 1, ultimaLatenciaMs: null });
      expect(porNombre.openai).toMatchObject({ estado: 'sin_llave' });
      expect(JSON.stringify(res.body)).not.toContain(LLAVES_FALSAS.groq);
    });

    it('muestra el cooldown y la última latencia después de un 429', async () => {
      configurarLlaves();
      stubProveedores({ groq: () => respuestaError(429), openai: responderSegunSchema });
      const { agent, admin, url } = await prepararFamilia(app);
      await agent.post(url).send({ contenido: 'mi hijo de 9 no suelta el celular' });

      const res = await (await loginComo(app, admin)).get('/api/ia/health');
      const groq = res.body.proveedores.find((p) => p.nombre === 'groq');
      expect(groq.estado).toBe('en_cooldown');
      expect(groq.motivoCooldown).toBe('rate_limit');
      expect(groq.ultimaLatenciaMs).toBeGreaterThanOrEqual(0);
      expect(res.body.proveedores.find((p) => p.nombre === 'openai').ultimaLatenciaMs).toBeGreaterThanOrEqual(0);
    });

    it.each([
      ['docente', crearDocente],
      ['padre', crearPadre],
      ['superadmin', crearSuperadmin],
    ])('%s recibe 403', async (_, crear) => {
      const agent = await loginComo(app, await crear());
      expect((await agent.get('/api/ia/health')).status).toBe(403);
    });

    it('sin sesión recibe 401', async () => {
      expect((await request(app).get('/api/ia/health')).status).toBe(401);
    });
  });

  describe('respuestas del chat: proveedor, latencia y fallback', () => {
    it('modo simulado (sin llaves): se marca como simulado', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { agent, url } = await prepararFamilia(app);
      const res = await agent.post(url).send({ contenido: 'mi hija de 4 años hace rabietas terribles' });
      expect(res.status).toBe(201);
      expect(res.body.respuesta.ia).toMatchObject({ modo: 'simulado' });
      expect(res.body.mensajeUsuario.deteccion).toMatchObject({ fuente: 'reglas', huboFallback: false });
    });

    it('con fallback a OpenAI guarda quién respondió y que hubo fallback', async () => {
      configurarLlaves();
      stubProveedores({ groq: () => respuestaError(503), openai: responderSegunSchema });
      const { agent, url, conversacionId } = await prepararFamilia(app);
      const res = await agent.post(url).send({ contenido: 'mi hijo de 9 no suelta el celular' });

      expect(res.status).toBe(201);
      expect(res.body.respuesta.ia).toMatchObject({ modo: 'llm', proveedor: 'openai', huboFallback: true, proveedoresFallidos: ['groq'] });
      expect(res.body.respuesta.ia.latenciaMs).toBeGreaterThanOrEqual(0);
      expect(res.body.mensajeUsuario.deteccion).toMatchObject({ fuente: 'ia', proveedor: 'openai', huboFallback: true });

      const guardada = await ConversacionIA.findById(conversacionId).lean();
      expect(guardada.mensajes.at(-1).ia).toMatchObject({ modo: 'llm', proveedor: 'openai', huboFallback: true });
    });

    it('si todos fallan responde con la ficha y lo deja registrado', async () => {
      configurarLlaves();
      stubProveedores({ groq: () => respuestaError(429), openai: () => respuestaError(401) });
      const { agent, url } = await prepararFamilia(app);
      const res = await agent.post(url).send({ contenido: 'mi hija de 4 años hace rabietas terribles' });

      expect(res.status).toBe(201);
      expect(res.body.respuesta.tipo).toBe('respuesta');
      expect(res.body.respuesta.ia).toMatchObject({ modo: 'fichas_fallback', huboFallback: true, proveedoresFallidos: ['groq', 'openai'] });
      expect(res.body.mensajeUsuario.deteccion).toMatchObject({ fuente: 'reglas', huboFallback: true });
      expect(res.body.mensajeUsuario.deteccion.errorIA).toBeTruthy();
    });

    it('la respuesta fija de riesgo grave se marca como plantilla', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { agent, url } = await prepararFamilia(app);
      const res = await agent.post(url).send({ contenido: 'mi hija dice que se quiere morir' });
      expect(res.body.respuesta.tipo).toBe('riesgo');
      expect(res.body.respuesta.ia).toMatchObject({ modo: 'plantilla' });
    });
  });

  describe('límite de solicitudes por usuario', () => {
    it('responde 429 con mensaje claro al pasarse (no cae a reglas en silencio)', async () => {
      configurarLlaves({ groq: false, openai: false });
      process.env.IA_RATE_LIMIT_MAX = '2';
      const { agent, url } = await prepararFamilia(app);

      expect((await agent.post(url).send({ contenido: 'hola' })).status).toBe(201);
      expect((await agent.post(url).send({ contenido: 'hola' })).status).toBe(201);
      const tercera = await agent.post(url).send({ contenido: 'hola' });

      expect(tercera.status).toBe(429);
      expect(tercera.body.code).toBe('LIMITE_IA');
      expect(tercera.body.message).toMatch(/límite de 2 solicitudes/);
      expect(tercera.body.retryAfter).toBeGreaterThan(0);
      expect(tercera.headers['retry-after']).toBeTruthy();
    });

    it('el límite es por usuario: otra familia no queda bloqueada', async () => {
      configurarLlaves({ groq: false, openai: false });
      process.env.IA_RATE_LIMIT_MAX = '1';
      const a = await prepararFamilia(app);
      const b = await prepararFamilia(app);

      await a.agent.post(a.url).send({ contenido: 'hola' });
      expect((await a.agent.post(a.url).send({ contenido: 'hola' })).status).toBe(429);
      expect((await b.agent.post(b.url).send({ contenido: 'hola' })).status).toBe(201);
    });
  });
});
