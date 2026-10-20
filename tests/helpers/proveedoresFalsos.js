import { vi } from 'vitest';

// Proveedores de IA falsos para las pruebas: se intercepta fetch hacia Groq y
// OpenAI. Las "llaves" son textos de prueba sin valor real.
export const URLS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
};
export const LLAVES_FALSAS = { groq: 'llave-falsa-groq-pruebas', openai: 'llave-falsa-openai-pruebas' };

export const proveedorDeUrl = (url) => Object.entries(URLS).find(([, u]) => u === String(url))?.[0] ?? null;

export const respuestaOk = (datos) => new Response(
  JSON.stringify({ choices: [{ message: { content: JSON.stringify(datos) } }] }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);
export const respuestaError = (status, mensaje = 'error de prueba') => new Response(
  JSON.stringify({ error: { message: mensaje } }),
  { status, headers: { 'Content-Type': 'application/json' } },
);
// nunca responde: solo termina cuando el timeout aborta la petición
export const sinRespuesta = (opciones) => new Promise((_, rechazar) => {
  opciones.signal.addEventListener('abort', () => rechazar(opciones.signal.reason));
});

/**
 * comportamiento: { groq: (body, opciones) => Response|Promise, openai: ... }
 * Devuelve el mock para contar llamadas por proveedor.
 */
export function stubProveedores(comportamiento) {
  const original = globalThis.fetch;
  const mock = vi.fn(async (url, opciones = {}) => {
    const proveedor = proveedorDeUrl(url);
    if (!proveedor) return original(url, opciones);
    const body = JSON.parse(opciones.body);
    const responder = comportamiento[proveedor];
    if (!responder) throw new Error(`proveedor ${proveedor} sin comportamiento en la prueba`);
    return responder(body, opciones);
  });
  vi.stubGlobal('fetch', mock);
  return {
    mock,
    llamadasA: (proveedor) => mock.mock.calls.filter(([url]) => proveedorDeUrl(url) === proveedor).length,
  };
}

export function configurarLlaves({ groq = true, openai = true } = {}) {
  process.env.GROQ_API_KEY = groq ? LLAVES_FALSAS.groq : '';
  process.env.OPENAI_API_KEY = openai ? LLAVES_FALSAS.openai : '';
}

const VARIABLES = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'LLM_PROVIDER_ORDER', 'LLM_TIMEOUT_MS', 'LLM_COOLDOWN_SECONDS', 'LLM_CACHE_TTL_SECONDS', 'IA_RATE_LIMIT_MAX'];
export function guardarEntorno() {
  const copia = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
  return () => {
    for (const [v, valor] of Object.entries(copia)) {
      if (valor === undefined) delete process.env[v];
      else process.env[v] = valor;
    }
    vi.unstubAllGlobals();
  };
}

// respuestas válidas para los schemas de Edumon
export const CLASIFICACION_NORMAL = {
  nivelRiesgo: 'normal', gravedad: 'ninguna', categoriaRiesgo: 'ninguna',
  eje: 'estilos_vida_saludable', subtema: 'pantallas', edad: 9, pideResolverTarea: false,
};
export const RESPUESTA_EDUMON = {
  mensaje: 'Respuesta de prueba basada en las fichas.',
  practica: 'Práctica de prueba de 5 minutos.',
  fichasUsadas: [],
  busquedas: [],
};
// responde según el schema que pide el servicio
export const responderSegunSchema = (body) => (body.response_format.json_schema.name === 'clasificacion_edumon'
  ? respuestaOk(CLASIFICACION_NORMAL)
  : respuestaOk(RESPUESTA_EDUMON));
