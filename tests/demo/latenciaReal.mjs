/**
 * Latencia real del chat contra un backend LOCAL (con o sin llaves de IA).
 *
 *   CLAVE_DEMO='…' node tests/demo/latenciaReal.mjs http://127.0.0.1:4100 12
 *
 * Una familia del seed de demo envía N mensajes de crianza (con la edad, para
 * que Edumon redacte la respuesta completa) y se mide el tiempo de cada
 * respuesta. Reporta promedio y p95, y cuántas respuestas redactó realmente un
 * LLM (respuesta.ia.modo === "llm"); las demás no cuentan como latencia real.
 */
const [, , BASE = 'http://127.0.0.1:4100', N = '12'] = process.argv;
const PAUSA_MS = Number(process.env.PAUSA_MS) || 3000;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw new Error('Solo contra un backend local');
const CLAVE = process.env.CLAVE_DEMO;
if (!CLAVE) throw new Error('Define CLAVE_DEMO');

const MENSAJES = [
  'mi hijo de 9 años no suelta el celular',
  'mi hija de 4 años hace rabietas terribles en las mañanas',
  'mi hijo de 7 años no se quiere dormir temprano',
  'mi hija de 15 años ya no me cuenta nada',
  'mi hijo de 8 años no quiere hacer las tareas',
  'mi hija de 6 años no quiere ir al colegio y llora',
  'mis hijos de 6 y 9 años pelean todo el día',
  'mi hijo de 5 años no come verduras',
  'mi hija de 11 años quiere tener tiktok',
  'mi hijo de 13 años contesta feo cuando le pido algo',
  'mi hija de 3 años muerde a otros niños en el jardín',
  'mi hijo de 10 años se frustra mucho cuando pierde',
];

// frasco de cookies por nombre: una respuesta que pone otra cookie no borra la sesión
const cookies = new Map();
const pedir = async (ruta, opciones = {}) => {
  const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(`${BASE}${ruta}`, { ...opciones, headers: { 'Content-Type': 'application/json', cookie, ...(opciones.headers ?? {}) } });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    cookies.set(par.slice(0, i), par.slice(i + 1));
  }
  return { status: r.status, body: await r.json().catch(() => null) };
};

const login = await pedir('/api/auth/login', { method: 'POST', body: JSON.stringify({ telefono: process.env.TELEFONO_FAMILIA || '+573009990010', 'contraseña': CLAVE }) });
if (login.status !== 200) throw new Error(`login: ${login.status}`);

const tiempos = [];
const modos = {};
for (let i = 0; i < Number(N); i += 1) {
  // una conversación por mensaje: cada respuesta es una consulta nueva y completa
  const conv = await pedir('/api/ia/conversaciones', { method: 'POST' });
  if (conv.status !== 201) throw new Error(`crear conversación: ${conv.status} ${JSON.stringify(conv.body)}`);
  const body = conv.body;
  const inicio = performance.now();
  const r = await pedir(`/api/ia/conversaciones/${body.conversacion._id}/mensajes`, { method: 'POST', body: JSON.stringify({ contenido: MENSAJES[i % MENSAJES.length] }) });
  const ms = performance.now() - inicio;
  const modo = r.body?.respuesta?.ia?.modo ?? `http_${r.status}`;
  modos[modo] = (modos[modo] ?? 0) + 1;
  if (modo === 'llm') tiempos.push(ms);
  console.log(`${String(i + 1).padStart(2)} · ${Math.round(ms)} ms · ${modo} · ${r.body?.respuesta?.ia?.proveedor ?? '-'} · clasificó ${r.body?.mensajeUsuario?.deteccion?.proveedor ?? 'reglas'}`);
  await new Promise((ok) => { setTimeout(ok, PAUSA_MS); });
}

const orden = [...tiempos].sort((a, b) => a - b);
const p95 = orden.length ? orden[Math.min(orden.length - 1, Math.ceil(0.95 * orden.length) - 1)] : null;
const promedio = orden.length ? orden.reduce((s, t) => s + t, 0) / orden.length : null;
console.log(JSON.stringify({
  mensajes: Number(N),
  respondidosPorLLM: tiempos.length,
  modos,
  promedioMs: promedio && Math.round(promedio),
  p95Ms: p95 && Math.round(p95),
  minMs: orden.length ? Math.round(orden[0]) : null,
  maxMs: orden.length ? Math.round(orden.at(-1)) : null,
}));
