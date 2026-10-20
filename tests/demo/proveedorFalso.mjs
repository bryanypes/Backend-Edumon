/**
 * Proveedor de IA FALSO, compatible con /v1/chat/completions de OpenAI, para el
 * ensayo de la demo sin gastar ni depender de llaves reales.
 *
 *   node tests/demo/proveedorFalso.mjs --puerto 4901 --nombre openai-falso --modo ok
 *   node tests/demo/proveedorFalso.mjs --puerto 4902 --nombre groq-falso --modo falla503
 *
 * Modos: ok | falla503 | falla429 | falla401 | lento (no responde: provoca timeout).
 * Se apunta el backend con OPENAI_BASE_URL=http://127.0.0.1:4901/v1 (o GROQ_BASE_URL).
 * Responde JSON válido para el schema que pide cada servicio; la clasificación
 * usa las reglas de Edumon para ser verosímil. NO es una prueba del modelo real.
 */
import http from 'node:http';
import { evaluarRiesgo, hayIndicioDudoso, detectarTema, extraerEdad } from '../../src/services/ia/reglas.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const PUERTO = Number(arg('puerto', 4901));
const NOMBRE = arg('nombre', 'proveedor-falso');
const MODO = arg('modo', 'ok');
let llamadas = 0;

// valor mínimo válido para un JSON Schema (structured outputs estricto)
const generar = (s) => {
  const tipo = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  if (s.enum) return s.enum[0];
  if (tipo === 'object') return Object.fromEntries((s.required ?? Object.keys(s.properties ?? {})).map((k) => [k, generar(s.properties[k])]));
  if (tipo === 'array') return [generar(s.items ?? { type: 'string' })];
  if (tipo === 'integer' || tipo === 'number') return 1;
  if (tipo === 'boolean') return false;
  return `Texto del ${NOMBRE} (proveedor simulado del ensayo).`;
};

const clasificar = (texto) => {
  const riesgo = evaluarRiesgo(texto);
  const tema = detectarTema(texto);
  const dudoso = !riesgo && hayIndicioDudoso(texto);
  return {
    nivelRiesgo: riesgo || dudoso ? 'riesgo' : 'normal',
    gravedad: riesgo?.gravedad ?? (dudoso ? 'grave' : 'ninguna'),
    categoriaRiesgo: riesgo?.categoria ?? 'ninguna',
    eje: tema?.eje ?? 'fuera_de_alcance',
    subtema: tema?.subtema ?? 'otro',
    edad: extraerEdad(texto),
    pideResolverTarea: false,
  };
};

const responder = (body) => {
  const nombre = body.response_format?.json_schema?.name;
  const schema = body.response_format?.json_schema?.schema ?? { type: 'object' };
  const ultimo = body.messages.at(-1)?.content ?? '';
  if (nombre === 'clasificacion_edumon') return clasificar(ultimo);
  const datos = generar(schema);
  if (nombre === 'respuesta_edumon') {
    datos.mensaje = `Respuesta redactada por ${NOMBRE} (simulado) usando solo las fichas curadas.`;
    datos.fichasUsadas = [...ultimo.matchAll(/<ficha id="([0-9a-f]{24})">/g)].slice(0, 1).map((m) => m[1]);
    datos.busquedas = [];
  }
  return datos;
};

http.createServer((req, res) => {
  let crudo = '';
  req.on('data', (c) => { crudo += c; });
  req.on('end', () => {
    llamadas += 1;
    if (!req.url.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
    const falla = { falla503: 503, falla429: 429, falla401: 401 }[MODO];
    if (MODO === 'lento') return; // nunca responde
    if (falla) {
      res.writeHead(falla, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: `${NOMBRE}: falla simulada ${falla}` } }));
      console.log(`[${NOMBRE}] #${llamadas} → ${falla}`);
      return;
    }
    const datos = responder(JSON.parse(crudo));
    const contenido = JSON.stringify(datos);
    // tokens aproximados (≈ 4 caracteres por token), como reportaría un proveedor real
    const usage = { prompt_tokens: Math.ceil(crudo.length / 4), completion_tokens: Math.ceil(contenido.length / 4) };
    res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ choices: [{ message: { content: contenido } }], usage }));
    console.log(`[${NOMBRE}] #${llamadas} → 200 (${JSON.parse(crudo).response_format?.json_schema?.name})`);
  });
}).listen(PUERTO, '127.0.0.1', () => console.log(`[${NOMBRE}] escuchando en http://127.0.0.1:${PUERTO}/v1 modo=${MODO}`));
