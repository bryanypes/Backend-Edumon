// Cliente mínimo de Groq (API compatible con OpenAI) con fetch nativo, y OpenAI como respaldo.
// Sin GROQ_API_KEY ni OPENAI_API_KEY, iaDisponible() es false y Edumon usa el modo simulado.

const TIMEOUT_MS = 30000;

const PROVEEDORES = [
  {
    nombre: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    clave: () => process.env.GROQ_API_KEY,
    modelo: () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    razonamiento: true,
  },
  {
    nombre: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    clave: () => process.env.OPENAI_API_KEY,
    modelo: () => process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    razonamiento: false,
  },
];

const configurados = () => PROVEEDORES.filter((p) => p.clave());

export const iaDisponible = () => configurados().length > 0;

export const modelo = () => configurados()[0]?.modelo() ?? null;

// el plan gratuito limita los tokens por minuto: ante un 429 se espera lo que
// pide Groq y se reintenta, siempre que la espera sea corta (si no, fallback)
const MAX_ESPERA_429_MS = Number(process.env.GROQ_MAX_ESPERA_429_MS) || 8000;
const MAX_REINTENTOS_429 = 2;

const esperaPedida = (respuesta, cuerpo) => {
  const cabecera = Number(respuesta.headers.get('retry-after'));
  if (cabecera > 0) return cabecera * 1000;
  const enMensaje = cuerpo?.error?.message?.match(/try again in (?:(\d+)m)?([\d.]+)(ms|s)/);
  if (!enMensaje) return null;
  const [, minutos = 0, valor, unidad] = enMensaje;
  return Number(minutos) * 60000 + Number(valor) * (unidad === 'ms' ? 1 : 1000);
};

const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function llamar(proveedor, opciones, hayRespaldo, intento = 0) {
  const { system, messages, schema, nombre, esfuerzo = 'medium', maxTokens = 4000 } = opciones;
  const respuesta = await fetch(proveedor.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${proveedor.clave()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: proveedor.modelo(),
      messages: [{ role: 'system', content: system }, ...messages],
      ...(proveedor.razonamiento ? { reasoning_effort: esfuerzo } : {}),
      max_completion_tokens: maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: { name: nombre, strict: true, schema },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const cuerpo = await respuesta.json().catch(() => null);
  if (respuesta.status === 429 && !hayRespaldo && intento < MAX_REINTENTOS_429) {
    const espera = esperaPedida(respuesta, cuerpo);
    if (espera != null && espera <= MAX_ESPERA_429_MS) {
      await esperar(espera + 250);
      return llamar(proveedor, opciones, hayRespaldo, intento + 1);
    }
  }
  if (!respuesta.ok) {
    throw new Error(`${proveedor.nombre} ${respuesta.status}: ${cuerpo?.error?.message || 'sin detalle'}`);
  }

  const contenido = cuerpo?.choices?.[0]?.message?.content;
  if (!contenido) throw new Error(`${proveedor.nombre} devolvió una respuesta vacía`);
  return JSON.parse(contenido);
}

/**
 * Pide una respuesta JSON validada contra `schema` (structured outputs estricto).
 * Prueba Groq y, si falla, OpenAI. Devuelve { datos, modelo } con el modelo que respondió.
 * Lanza error si todos fallan: el llamador decide el fallback.
 */
export async function completarJSONConModelo(opciones) {
  const proveedores = configurados();
  const errores = [];
  for (const [i, proveedor] of proveedores.entries()) {
    const siguiente = proveedores[i + 1];
    try {
      const datos = await llamar(proveedor, opciones, Boolean(siguiente));
      return { datos, modelo: proveedor.modelo() };
    } catch (error) {
      errores.push(error.message);
      if (siguiente) console.warn(`[Edumon] ${proveedor.nombre} falló (${error.message}), paso a ${siguiente.nombre}`);
    }
  }
  throw new Error(errores.join(' | ') || 'No hay proveedor de IA configurado');
}

export async function completarJSON(opciones) {
  return (await completarJSONConModelo(opciones)).datos;
}
