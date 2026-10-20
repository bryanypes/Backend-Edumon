// Capa única de proveedores de IA (API compatible con OpenAI, fetch nativo).
//
// - El orden NO está en el código: LLM_PROVIDER_ORDER (por defecto "groq,openai").
// - Un proveedor sin llave se omite sin error. Sin ninguna llave, iaDisponible()
//   es false y Edumon trabaja en modo simulado (reglas + fichas).
// - Fallback automático al siguiente proveedor ante 429, 401/403, 5xx, timeout
//   (LLM_TIMEOUT_MS) o error de red. Tras un 429 o un 401/403 el proveedor queda
//   en cooldown LLM_COOLDOWN_SECONDS y se salta sin volver a llamarlo.
// - Si todos fallan se lanza ErrorIA: el llamador decide su respaldo (reglas,
//   fichas, plantillas) y lo deja registrado; nunca en silencio.
// - Nunca se registra ni se devuelve una llave: los mensajes de error se depuran.

import mongoose from 'mongoose';
import UsoIA from '../../models/UsoIA.js';

const CATALOGO = {
  groq: {
    nombre: 'groq',
    // *_BASE_URL (opcional): proxy o servidor compatible; vacío = la API oficial
    url: () => `${process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'}/chat/completions`,
    clave: () => process.env.GROQ_API_KEY,
    modelo: () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    razonamiento: true,
  },
  openai: {
    nombre: 'openai',
    url: () => `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`,
    clave: () => process.env.OPENAI_API_KEY,
    modelo: () => process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    razonamiento: false,
  },
};

const numeroEnv = (nombre, porDefecto) => {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
};

export const configuracionIA = () => ({
  orden: (process.env.LLM_PROVIDER_ORDER || 'groq,openai')
    .split(',').map((p) => p.trim().toLowerCase()).filter((p, i, todos) => CATALOGO[p] && todos.indexOf(p) === i),
  timeoutMs: numeroEnv('LLM_TIMEOUT_MS', 20000),
  cooldownMs: numeroEnv('LLM_COOLDOWN_SECONDS', 60) * 1000,
});

// estado en memoria por proceso: cooldown y última latencia de cada proveedor
const estado = new Map();
const estadoDe = (nombre) => {
  if (!estado.has(nombre)) estado.set(nombre, { cooldownHasta: 0, motivoCooldown: null, ultimaLatenciaMs: null, ultimoError: null, ultimoExito: null });
  return estado.get(nombre);
};

// solo para pruebas
export const _reiniciarEstadoIA = () => estado.clear();

const configurados = () => configuracionIA().orden.map((n) => CATALOGO[n]).filter((p) => p.clave());

export const iaDisponible = () => configurados().length > 0;

// el modelo del primer proveedor configurado (para informes)
export const modeloPrincipal = () => {
  const p = configurados()[0];
  return p ? `${p.nombre}/${p.modelo()}` : null;
};

export class ErrorIA extends Error {
  constructor(mensaje, intentos = []) {
    super(mensaje);
    this.name = 'ErrorIA';
    this.intentos = intentos;
  }
}

class ErrorProveedor extends Error {
  constructor(proveedor, tipo, status, detalle) {
    super(`${proveedor} ${status ?? tipo}: ${detalle}`);
    this.proveedor = proveedor;
    this.tipo = tipo; // rate_limit | auth | servidor | timeout | red | peticion | respuesta
    this.status = status ?? null;
  }
}

// quita cualquier cosa con forma de llave del texto que viene del proveedor
const depurar = (texto = '') => {
  let limpio = String(texto);
  for (const p of Object.values(CATALOGO)) {
    const clave = p.clave();
    if (clave) limpio = limpio.split(clave).join('[llave]');
  }
  return limpio.replace(/\b(sk|gsk|sk-proj)[-_][A-Za-z0-9_*\-]{4,}/g, '[llave]').slice(0, 300);
};

const tipoPorStatus = (status) => {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'servidor';
  return 'peticion';
};

async function llamar(proveedor, opciones, timeoutMs) {
  const { system, messages, schema, nombre, esfuerzo = 'medium', maxTokens = 4000 } = opciones;
  let respuesta;
  try {
    respuesta = await fetch(proveedor.url(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${proveedor.clave()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: proveedor.modelo(),
        messages: [{ role: 'system', content: system }, ...messages],
        ...(proveedor.razonamiento ? { reasoning_effort: esfuerzo } : {}),
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: nombre, strict: true, schema } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const esTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new ErrorProveedor(proveedor.nombre, esTimeout ? 'timeout' : 'red', null,
      esTimeout ? `sin respuesta en ${timeoutMs} ms (timeout)` : depurar(error?.cause?.code || error?.message));
  }

  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const tipo = tipoPorStatus(respuesta.status);
    // el texto de un 401 puede repetir parte de la llave: no se usa
    const detalle = tipo === 'auth' ? 'llave inválida, vencida o sin permisos' : depurar(cuerpo?.error?.message || 'sin detalle');
    throw new ErrorProveedor(proveedor.nombre, tipo, respuesta.status, detalle);
  }

  const contenido = cuerpo?.choices?.[0]?.message?.content;
  if (!contenido) throw new ErrorProveedor(proveedor.nombre, 'respuesta', respuesta.status, 'respuesta vacía');
  let datos;
  try {
    datos = JSON.parse(contenido);
  } catch {
    throw new ErrorProveedor(proveedor.nombre, 'respuesta', respuesta.status, 'JSON inválido');
  }
  // tokens reales que cobró el proveedor (para el costo)
  const uso = {
    tokensEntrada: Number(cuerpo?.usage?.prompt_tokens) || 0,
    tokensSalida: Number(cuerpo?.usage?.completion_tokens) || 0,
  };
  return { datos, uso };
}

// acumulado del proceso (lo usa la evaluación, que corre sin base de datos)
const acumulado = { llamadas: 0, tokensEntrada: 0, tokensSalida: 0, porModelo: {} };
export const usoAcumulado = () => JSON.parse(JSON.stringify(acumulado));

// cada llamada exitosa queda en UsoIA si hay base de datos conectada; nunca
// bloquea ni rompe la respuesta (es solo medición)
async function registrarUso(fila) {
  acumulado.llamadas += 1;
  acumulado.tokensEntrada += fila.tokensEntrada;
  acumulado.tokensSalida += fila.tokensSalida;
  const clave = `${fila.proveedor}/${fila.modelo}`;
  acumulado.porModelo[clave] ??= { llamadas: 0, tokensEntrada: 0, tokensSalida: 0 };
  acumulado.porModelo[clave].llamadas += 1;
  acumulado.porModelo[clave].tokensEntrada += fila.tokensEntrada;
  acumulado.porModelo[clave].tokensSalida += fila.tokensSalida;
  if (mongoose.connection.readyState !== 1) return;
  try {
    await UsoIA.create(fila);
  } catch (error) {
    console.warn('[Edumon IA] No se pudo registrar el uso de tokens:', error.message);
  }
}

/**
 * Pide una respuesta JSON validada contra `schema` (structured outputs estricto)
 * recorriendo los proveedores en el orden configurado.
 * @returns {{ datos, proveedor, modelo, latenciaMs, huboFallback, intentos }}
 * @throws {ErrorIA} si ningún proveedor respondió (o no hay ninguno configurado)
 */
export async function completar(opciones) {
  const { timeoutMs, cooldownMs } = configuracionIA();
  const proveedores = configurados();
  const intentos = [];

  for (const proveedor of proveedores) {
    const est = estadoDe(proveedor.nombre);
    if (est.cooldownHasta > Date.now()) {
      intentos.push({ proveedor: proveedor.nombre, resultado: 'omitido_cooldown', motivo: est.motivoCooldown });
      continue;
    }

    const inicio = Date.now();
    try {
      const { datos, uso } = await llamar(proveedor, opciones, timeoutMs);
      const latenciaMs = Date.now() - inicio;
      Object.assign(est, { ultimaLatenciaMs: latenciaMs, ultimoExito: new Date() });
      await registrarUso({
        proveedor: proveedor.nombre, modelo: proveedor.modelo(), operacion: opciones.nombre ?? null,
        ...uso, latenciaMs, huboFallback: intentos.length > 0,
      });
      return {
        datos,
        proveedor: proveedor.nombre,
        modelo: proveedor.modelo(),
        latenciaMs,
        huboFallback: intentos.length > 0,
        intentos,
        uso,
      };
    } catch (error) {
      const tipo = error.tipo ?? 'red';
      est.ultimaLatenciaMs = Date.now() - inicio;
      est.ultimoError = { tipo, status: error.status ?? null, en: new Date() };
      if (tipo === 'rate_limit' || tipo === 'auth') {
        est.cooldownHasta = Date.now() + cooldownMs;
        est.motivoCooldown = tipo;
      }
      intentos.push({ proveedor: proveedor.nombre, resultado: 'error', tipo, status: error.status ?? null, mensaje: depurar(error.message) });
      console.warn(`[Edumon IA] ${depurar(error.message)}${tipo === 'rate_limit' || tipo === 'auth' ? ` — en cooldown ${cooldownMs / 1000} s` : ''}`);
    }
  }

  throw new ErrorIA(
    proveedores.length
      ? `Ningún proveedor de IA respondió: ${intentos.map((i) => i.mensaje ?? `${i.proveedor} en cooldown (${i.motivo})`).join(' | ')}`
      : 'No hay proveedor de IA configurado',
    intentos,
  );
}

// interfaz única: clasificar un mensaje y redactar una respuesta
export const classify = (opciones) => completar({ esfuerzo: 'low', maxTokens: 2000, ...opciones });
export const respond = (opciones) => completar({ esfuerzo: 'medium', ...opciones });

/**
 * Streaming: por ahora entrega la respuesta completa en un solo fragmento (SSE
 * queda para después, ver CHANGELOG). Mantiene la interfaz para que el llamador
 * no cambie cuando se implemente.
 */
export async function* stream(opciones) {
  yield { tipo: 'completo', ...(await respond(opciones)) };
}

// compatibilidad con los servicios que solo necesitan los datos
export const completarJSON = async (opciones) => (await completar(opciones)).datos;

/** Estado de cada proveedor del catálogo, para /api/ia/health. Nunca incluye llaves. */
export function estadoProveedores() {
  const { orden, timeoutMs, cooldownMs } = configuracionIA();
  const ahora = Date.now();
  const proveedores = Object.values(CATALOGO).map((p) => {
    const est = estadoDe(p.nombre);
    const posicion = orden.indexOf(p.nombre);
    let estadoActual = 'activo';
    if (!p.clave()) estadoActual = 'sin_llave';
    else if (posicion === -1) estadoActual = 'fuera_del_orden';
    else if (est.cooldownHasta > ahora) estadoActual = 'en_cooldown';
    return {
      nombre: p.nombre,
      modelo: p.modelo(),
      orden: posicion === -1 ? null : posicion + 1,
      estado: estadoActual,
      cooldownRestanteSegundos: est.cooldownHasta > ahora ? Math.ceil((est.cooldownHasta - ahora) / 1000) : 0,
      motivoCooldown: est.cooldownHasta > ahora ? est.motivoCooldown : null,
      ultimaLatenciaMs: est.ultimaLatenciaMs,
      ultimoExito: est.ultimoExito,
      ultimoError: est.ultimoError,
    };
  });
  return {
    modo: iaDisponible() ? 'llm' : 'simulado',
    orden,
    timeoutMs,
    cooldownSegundos: cooldownMs / 1000,
    proveedores,
  };
}

/** Línea de arranque: qué proveedores están activos y en qué orden (sin llaves). */
export function registrarProveedoresAlArrancar(log = console.log) {
  const activos = configurados();
  log(activos.length
    ? `[Edumon IA] Proveedores activos en orden: ${activos.map((p, i) => `${i + 1}. ${p.nombre} (${p.modelo()})`).join(', ')}`
    : '[Edumon IA] Sin llaves de IA: modo simulado (reglas + fichas)');
  return activos.map((p) => p.nombre);
}
