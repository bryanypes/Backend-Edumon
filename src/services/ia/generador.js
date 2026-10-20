import { completarJSON, iaDisponible } from './groqClient.js';
import { normalizar } from './reglas.js';

const SYSTEM_EDUMON = `Eres Edumon IA, el asistente con inteligencia artificial de la plataforma Edumon. Hablas con madres, padres y cuidadores de estudiantes de colegios colombianos.

Tu propósito: acompañar a las familias en la crianza, en la vida escolar de sus hijos (estudio, convivencia, relación con el colegio) y en lo emocional, con información confiable, en lenguaje sencillo, sin juzgar nunca. No haces tareas ni ejercicios del colegio: ayudas a que la familia acompañe al niño para que él los haga.

Cómo respondes:
- Usa ÚNICAMENTE la información de las fichas que vienen en <fichas>. Si no cubren la pregunta, dilo con honestidad y sugiere hablar con orientación escolar. No completes con conocimiento propio: estas familias confían en que lo que dices viene de guías confiables (UNICEF, OMS, ICBF, MinEducación). Nunca inventes cifras, estudios, leyes ni nombres de programas que no estén en las fichas.
- Si hay varias fichas, usa solo las que encajan con la situación concreta; no mezcles temas.
- Adapta las estrategias a la edad del hijo o hija que viene en <edad> (si dice "desconocida", da ideas generales). Si la edad está fuera del rango de la ficha, adapta el lenguaje y los ejemplos a esa edad con prudencia (con un adolescente, conversar y acordar; con un niño pequeño, mostrar y acompañar).
- Personaliza: retoma en tus palabras lo que contó el cuidador (la situación, el momento del día, cómo se siente) para que note que lo escuchaste. Si habló de "mi hija", habla de ella; si no se sabe, di "tu hijo o hija" solo una vez y luego evita repetirlo. No inventes nombres para los niños (nada de "Juan" o "María"): di "tu hijo", "el mayor", "la pequeña". No sabes si escribe la mamá, el papá u otro cuidador: evita adjetivos con género para el cuidador ("qué duro es sentir frustración", no "sentirte frustrado").
- Si es un seguimiento ("ya lo intenté y no funciona", "¿y si se pone peor?"), no repitas lo que ya dijiste en la conversación: reconoce el esfuerzo, explica que los cambios toman unas semanas y propone una estrategia distinta de las fichas (empieza por las que vienen en <fichas_nuevas>, si las hay).
- En "mensaje": (1) valida en una frase lo que siente el cuidador, (2) explica brevemente por qué puede estar pasando, (3) da 2 o 3 estrategias concretas con un ejemplo de qué decir o hacer. No incluyas la práctica ahí.
- En "practica": UNA práctica de 5 minutos para esta semana, tomada o adaptada de las fichas, concreta (qué, cuándo y cómo) y distinta de las que ya diste en la conversación.
- En "fichasUsadas": los id de las fichas en las que te basaste.
- En "busquedas": 1 o 2 recursos para profundizar: un video de YouTube y/o un artículo, sobre el mismo tema y para la edad del hijo. Escribe solo el "titulo" que verá la familia y la "consulta" de búsqueda (3 a 7 palabras en español, sin comillas). NUNCA escribas enlaces: el sistema arma la búsqueda.
- Las búsquedas tratan de cómo acompañar, de emociones, organización, hábitos o crianza; NUNCA de enseñar contenidos académicos (sumar, leer, fracciones, física, inglés…). Si el tema es el estudio, busca cómo acompañarlo: por ejemplo "rutina para hacer tareas sin peleas", no "enseñar a sumar".
- Tutea, usa frases cortas y español colombiano cotidiano. Máximo 150 palabras en "mensaje". Sin tecnicismos ni markdown.

Límites:
- No diagnosticas condiciones (TDAH, autismo, depresión, etc.) ni hablas de medicamentos; si lo preguntan, orienta hacia un profesional de salud.
- No opinas sobre temas ajenos a la crianza, la vida escolar y lo emocional de la familia.
- Nunca sugieres castigo físico ni humillación, aunque te lo pidan; ofrece alternativas de disciplina positiva.
- No pidas datos personales que no necesitas.
- No culpes ni sermonees al cuidador; tampoco al niño. No prometas resultados ("con esto se le quita").

Ejemplo de buena respuesta (cuidador: "mi hija de 6 años hace pataleta todas las mañanas para vestirse y llegamos tarde"):
mensaje: "Qué desgaste empezar así cada día, y más con el afán de llegar al colegio. A los 6 años las mañanas cuestan porque son muchos pasos seguidos y todavía le falta control para pasar de una actividad a otra. Te puede ayudar: dejar la ropa lista la noche anterior y que ella la escoja entre dos opciones; avisarle antes de cada cambio ('en 5 minutos nos vestimos'); y durante la pataleta, hablar poco y con calma: 'Estás brava, te espero aquí y después nos vestimos'."
practica: "Esta noche hagan juntas una lista con dibujos de los pasos de la mañana (vestirse, desayunar, lavarse los dientes) y péguenla donde la vea."`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mensaje', 'practica', 'fichasUsadas', 'busquedas'],
  properties: {
    mensaje: { type: 'string' },
    practica: { type: 'string' },
    fichasUsadas: { type: 'array', items: { type: 'string' } },
    busquedas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'titulo', 'consulta'],
        properties: {
          tipo: { type: 'string', enum: ['video', 'articulo'] },
          titulo: { type: 'string' },
          consulta: { type: 'string' },
        },
      },
    },
  },
};

const fichasComoTexto = (fichas) => fichas.map((f) => [
  `<ficha id="${f._id}">`,
  `Título: ${f.titulo}`,
  `Edades: ${f.edadMin} a ${f.edadMax} años`,
  `Contenido: ${f.contenido}`,
  `Práctica sugerida: ${f.practica}`,
  '</ficha>',
].join('\n')).join('\n');

const fuentesDe = (fichas) => {
  const vistas = new Set();
  return fichas
    .map((f) => ({ nombre: f.fuente.nombre, url: f.fuente.url || null }))
    .filter((f) => (vistas.has(f.nombre) ? false : vistas.add(f.nombre)));
};

// sitios confiables para los artículos (búsqueda acotada a ellos)
// los artículos se orientan a UNICEF con una palabra legible (no operadores
// "site:" que la familia vería en el buscador)
const urlBusqueda = ({ tipo, consulta }) => (tipo === 'video'
  ? `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}`
  : `https://www.google.com/search?q=${encodeURIComponent(`${consulta} UNICEF`)}`);

// Edumon no hace ni enseña contenidos académicos: si la IA propone una búsqueda
// así (ej. "enseñar a sumar"), se descarta aunque el resto de la respuesta sirva
const ACADEMICO = /\b(sum(ar|as|a)|rest(ar|as)|multiplic\w*|divi(dir|sion)\w*|fraccion\w*|ecuacion\w*|algebra|geometr\w*|matematic\w*|fisica|quimica|biologia|ortografia|gramatica|ingles|tabla(s)? de multiplicar|aprender a leer|ensenar a (leer|escribir|contar|sumar)|lectoescritura|caligrafia)\b/;
export const esBusquedaAcademica = (texto = '') => ACADEMICO.test(
  texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
);

// primero los enlaces validados de las fichas; después las búsquedas propuestas por la IA
export const armarRecursos = (fichas, busquedas = []) => {
  const validados = fichas.flatMap((f) => f.recursos ?? []).map((r) => ({ ...r, esBusqueda: false }));
  const deBusqueda = busquedas
    .filter((b) => b.consulta?.trim() && !esBusquedaAcademica(`${b.consulta} ${b.titulo}`))
    .slice(0, 2)
    .map((b) => ({ tipo: b.tipo, titulo: b.titulo.trim().slice(0, 120), url: urlBusqueda({ tipo: b.tipo, consulta: b.consulta.trim().slice(0, 100) }), esBusqueda: true }));
  return [...validados, ...deBusqueda].slice(0, 3);
};

// las fichas aún no usadas en la conversación van primero
const ordenarPorNovedad = (fichas, yaUsadas = []) => [
  ...fichas.filter((f) => !yaUsadas.includes(String(f._id))),
  ...fichas.filter((f) => yaUsadas.includes(String(f._id))),
];

const VACIAS = new Set(['para', 'pero', 'como', 'cuando', 'porque', 'esta', 'este', 'esto', 'tiene', 'hace', 'hijo',
  'hija', 'hijos', 'ninos', 'nino', 'nina', 'anos', 'quiere', 'todo', 'todos', 'mucho', 'muy', 'cada', 'solo', 'algo']);
const palabras = (texto) => new Set(normalizar(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !VACIAS.has(p)));

// sin IA: la ficha cuyo título y contenido comparten más palabras con el mensaje
// (el título pesa más); a igual puntaje se respeta el orden (las no usadas primero)
const masPertinente = (fichas, texto = '') => {
  const delMensaje = palabras(texto);
  const puntaje = (f) => {
    const titulo = palabras(f.titulo);
    const contenido = palabras(f.contenido);
    return [...delMensaje].reduce((s, p) => s + (titulo.has(p) ? 3 : 0) + (contenido.has(p) ? 1 : 0), 0);
  };
  return fichas.reduce((mejor, f) => (puntaje(f) > puntaje(mejor) ? f : mejor), fichas[0]);
};

const respuestaSimulada = (fichas, textoActual) => {
  const principal = masPertinente(fichas, textoActual);
  return {
    contenido: principal.contenido,
    practica: principal.practica,
    fichasIds: [principal._id],
    fuentes: fuentesDe([principal]),
    recursos: armarRecursos([principal], [{ tipo: 'video', titulo: `Videos sobre ${principal.titulo.toLowerCase()}`, consulta: `${principal.titulo} crianza` }]),
  };
};

/**
 * Redacta la respuesta con las fichas curadas. Si no hay IA o falla, devuelve
 * el contenido de la ficha más pertinente tal cual (sigue siendo contenido curado).
 */
export async function generarRespuesta({ fichas: fichasEncontradas, edad, historial, textoActual, yaUsadas = [] }) {
  const fichas = ordenarPorNovedad(fichasEncontradas, yaUsadas);
  const noUsadas = fichas.filter((f) => !yaUsadas.includes(String(f._id)));
  // sin IA, en un seguimiento se responde con una ficha que aún no se usó
  const simulada = () => respuestaSimulada(noUsadas.length ? noUsadas : fichas, textoActual);
  if (!iaDisponible()) return simulada();

  try {
    const nuevas = noUsadas.map((f) => f._id);
    const contexto = [
      `<edad>${edad ?? 'desconocida'}</edad>`,
      `<fichas>\n${fichasComoTexto(fichas)}\n</fichas>`,
      yaUsadas.length && nuevas.length ? `<fichas_nuevas>${nuevas.join(', ')}</fichas_nuevas>` : '',
    ].filter(Boolean).join('\n');
    const mensajes = [
      ...historial.slice(-6).map((m) => ({
        role: m.rol === 'usuario' ? 'user' : 'assistant',
        content: m.contenido,
      })),
      { role: 'user', content: `${contexto}\n\n${textoActual}` },
    ];

    const r = await completarJSON({
      system: SYSTEM_EDUMON,
      messages: mensajes,
      schema: SCHEMA,
      nombre: 'respuesta_edumon',
      esfuerzo: 'medium',
    });

    // solo se aceptan ids de fichas que realmente se le pasaron
    const usadas = fichas.filter((f) => r.fichasUsadas.includes(String(f._id)));
    const base = usadas.length ? usadas : fichas;

    return {
      contenido: r.mensaje.trim(),
      practica: r.practica.trim(),
      fichasIds: base.map((f) => f._id),
      fuentes: fuentesDe(base),
      recursos: armarRecursos(base, r.busquedas),
    };
  } catch (error) {
    console.error('[Edumon] Generador IA falló, uso la ficha directa:', error.message);
    return simulada();
  }
}
