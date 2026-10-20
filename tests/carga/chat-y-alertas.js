// Prueba de carga de Edumon IA con k6: chat de familias + tablero de alertas.
//
// SOLO contra un backend LOCAL en modo simulado con el seed de demo (nunca
// producción, nunca un proveedor de IA real). Ver tests/carga/LEEME.md.
//
//   CLAVE_DEMO='…' k6 run -e BASE=http://127.0.0.1:4100 tests/carga/chat-y-alertas.js
//
// Volumen pensado para quedar bajo el límite global de la API (500 solicitudes
// cada 15 min por IP): ~150 solicitudes. Por encima se mediría el limitador.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://127.0.0.1:4100';
const CLAVE = __ENV.CLAVE_DEMO;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) fail(`Solo contra un backend local (BASE=${BASE})`);
if (!CLAVE) fail('Define CLAVE_DEMO (ver DEMO-BACKEND.md)');

const latenciaChat = new Trend('latencia_chat_ms', true);
const latenciaAlertas = new Trend('latencia_alertas_ms', true);
const JSON_H = { headers: { 'Content-Type': 'application/json' } };

// familias del seed de demo: +573009990006 … +573009990025
const telefonoFamilia = (n) => `+57300999${String(6 + n).padStart(4, '0')}`;
const MENSAJES = [
  'mi hijo no suelta el celular',
  'mi hija de 4 años hace rabietas muy fuertes',
  'le cuesta dormirse en la noche',
  'mi hijo adolescente ya no me cuenta nada',
  'no quiere hacer las tareas',
  '¿cómo pongo límites sin gritar?',
  'mis hijos pelean todo el tiempo',
  'no come casi nada',
];

export const options = {
  // cada VU es un usuario con sesión: k6 no debe borrar la cookie entre iteraciones
  noCookiesReset: true,
  scenarios: {
    chat: { executor: 'per-vu-iterations', exec: 'chat', vus: 10, iterations: 8, maxDuration: '3m' },
    alertas: { executor: 'constant-vus', exec: 'alertas', vus: 2, duration: '40s', startTime: '2s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    latencia_chat_ms: ['p(95)<1500'],
    latencia_alertas_ms: ['p(95)<800'],
  },
};

const login = (telefono) => {
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ telefono, 'contraseña': CLAVE }), JSON_H);
  if (!check(r, { 'login 200': (x) => x.status === 200 })) fail(`login ${telefono}: ${r.status}`);
};

// estado por VU (cada VU es una familia distinta, con su propia cookie)
let conversacion = null;
let indice = 0;

export function chat() {
  if (!conversacion) {
    login(telefonoFamilia(__VU - 1));
    const c = http.post(`${BASE}/api/ia/conversaciones`, null, JSON_H);
    check(c, { 'conversación 201': (x) => x.status === 201 });
    conversacion = c.json('conversacion._id');
  }
  const contenido = MENSAJES[(indice + __VU) % MENSAJES.length];
  indice += 1;
  const r = http.post(`${BASE}/api/ia/conversaciones/${conversacion}/mensajes`, JSON.stringify({ contenido }), JSON_H);
  latenciaChat.add(r.timings.duration);
  check(r, { 'mensaje 201': (x) => x.status === 201, 'trae respuesta': (x) => Boolean(x.json('respuesta.contenido')) });
  sleep(0.5);
}

let sesionAlertas = false;
export function alertas() {
  if (!sesionAlertas) { login('+573009990002'); sesionAlertas = true; }
  const r = http.get(`${BASE}/api/ia/alertas`);
  latenciaAlertas.add(r.timings.duration);
  check(r, { 'alertas 200': (x) => x.status === 200 });
  sleep(1);
}
