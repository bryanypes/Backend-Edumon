import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crearApp from '../../src/app.js';
import AlertaRiesgo from '../../src/models/AlertaRiesgo.js';
import UsoIA from '../../src/models/UsoIA.js';
import Institucion from '../../src/models/Institucion.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { _reiniciarEstadoIA } from '../../src/services/ia/proveedorIA.js';
import { _limpiarCacheClasificaciones } from '../../src/services/ia/clasificador.js';
import { crearPadre, crearDocente, crearAdministrador, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import { configurarLlaves, guardarEntorno, responderSegunSchema } from '../helpers/proveedoresFalsos.js';

const AUDIO = Buffer.from('audio-de-prueba-ficticio');

// Whisper simulado: responde según `transcripcion` (texto, duración o estado HTTP)
const stubWhisper = (transcripcion) => {
  const original = globalThis.fetch;
  const mock = vi.fn(async (url, opciones) => {
    const u = String(url);
    if (u.endsWith('/audio/transcriptions')) {
      if (transcripcion.status) return new Response(JSON.stringify({ error: { message: 'falla simulada' } }), { status: transcripcion.status });
      return new Response(JSON.stringify({ text: transcripcion.texto, duration: transcripcion.duracion }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.endsWith('/chat/completions')) return responderSegunSchema(JSON.parse(opciones.body));
    return original(url, opciones);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

describe('Notas de voz', () => {
  let app;
  let restaurar;
  let familia;
  beforeEach(async () => {
    restaurar = guardarEntorno();
    _reiniciarEstadoIA();
    _limpiarCacheClasificaciones();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ app } = crearApp());
    await cargarFichas();
    process.env.IA_NOTAS_VOZ = 'true';
    configurarLlaves({ openai: false });
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
    const agent = await loginComo(app, await crearPadre({ institucionId: institucion._id }));
    await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    const { body } = await agent.post('/api/ia/conversaciones');
    familia = { agent, institucion, url: `/api/ia/conversaciones/${body.conversacion._id}/audio` };
  });
  afterEach(() => {
    delete process.env.IA_NOTAS_VOZ;
    delete process.env.IA_AUDIO_MAX_MB;
    delete process.env.IA_AUDIO_MAX_SEGUNDOS;
    restaurar();
    vi.restoreAllMocks();
  });

  const enviar = (tipo = 'audio/webm', nombre = 'nota.webm') => familia.agent.post(familia.url).attach('audio', AUDIO, { filename: nombre, contentType: tipo });

  it('apagado por defecto: 404 NOTAS_VOZ_DESACTIVADAS', async () => {
    delete process.env.IA_NOTAS_VOZ;
    const res = await enviar();
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOTAS_VOZ_DESACTIVADAS');
  });

  it('un caso grave dictado pasa por la misma red de seguridad: respuesta fija y alerta', async () => {
    stubWhisper({ texto: 'me kiero matar ya no puedo mas', duracion: 4.2 });
    const res = await enviar();
    expect(res.status).toBe(201);
    expect(res.body.transcripcion).toMatchObject({ texto: 'me kiero matar ya no puedo mas', duracionSegundos: 4.2, proveedor: 'groq', modelo: 'whisper-large-v3-turbo' });
    expect(res.body.respuesta.tipo).toBe('riesgo');
    expect(res.body.mensajeUsuario).toMatchObject({ entrada: 'voz', nivelRiesgo: 'riesgo' });
    expect(await AlertaRiesgo.countDocuments()).toBe(1);
    const uso = await UsoIA.findOne({ operacion: 'transcripcion' }).lean();
    expect(uso).toMatchObject({ proveedor: 'groq', segundosAudio: 4.2 });
  });

  it('una consulta normal dictada recibe la respuesta normal', async () => {
    stubWhisper({ texto: 'mi hijo de 9 no suelta el celular', duracion: 3 });
    const res = await enviar('audio/ogg;codecs=opus', 'nota.ogg');
    expect(res.status).toBe(201);
    expect(res.body.respuesta.tipo).toBe('respuesta');
  });

  it('valida tipo, tamaño, duración, archivo faltante y texto vacío', async () => {
    stubWhisper({ texto: 'hola', duracion: 2 });
    expect((await enviar('application/pdf', 'x.pdf')).body).toMatchObject({ code: 'AUDIO_INVALIDO' });
    expect((await familia.agent.post(familia.url)).status).toBe(400);

    process.env.IA_AUDIO_MAX_MB = '0.00001';
    expect((await enviar()).status).toBe(413);
    delete process.env.IA_AUDIO_MAX_MB;

    process.env.IA_AUDIO_MAX_SEGUNDOS = '1';
    const largo = await enviar();
    expect(largo.status).toBe(413);
    expect(largo.body.code).toBe('AUDIO_DEMASIADO_LARGO');
    delete process.env.IA_AUDIO_MAX_SEGUNDOS;

    stubWhisper({ texto: '   ', duracion: 2 });
    expect((await enviar()).body.code).toBe('AUDIO_SIN_TEXTO');
  });

  it('si no se puede transcribir, pide escribir (503) y no crea mensajes', async () => {
    stubWhisper({ status: 500 });
    const res = await enviar();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('TRANSCRIPCION_NO_DISPONIBLE');
  });

  it('solo familias: un docente recibe 403', async () => {
    stubWhisper({ texto: 'hola', duracion: 1 });
    const docente = await loginComo(app, await crearDocente({ institucionId: familia.institucion._id }));
    expect((await docente.post(familia.url).attach('audio', AUDIO, { filename: 'n.webm', contentType: 'audio/webm' })).status).toBe(403);
  });
});
