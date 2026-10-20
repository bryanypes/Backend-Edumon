import FichaCrianza from '../../models/FichaCrianza.js';
import { completarJSON, iaDisponible } from './groqClient.js';
import { detectarTema, normalizar } from './reglas.js';
import { armarRecursos } from './generador.js';
import { clasificar } from './clasificador.js';
import { EJES_CRIANZA, EJES_LABELS, SUBTEMAS, SUBTEMAS_POR_EJE } from '../../config/edumonIA.js';

// la descripción de una Tarea admite 2000 caracteres (HTML incluido)
const MAX_DESCRIPCION = 2000;

const SYSTEM_RETO = `Diseñas retos de escuela de padres para colegios colombianos (Ley 2025 de 2020, Decreto 459 de 2024). Un reto es una actividad corta que la familia hace en casa durante la semana con su hijo o hija, y luego entrega una reflexión al docente.

Reglas:
- El reto trata SOLO del tema de <tema>, aunque no esté en ninguna lista. No lo mezcles con otros temas.
- Si vienen fichas en <fichas> y tratan ese tema, basa el reto en ellas: son material curado de guías oficiales (UNICEF, OMS, ICBF, MinEducación). Si no vienen fichas, usa solo principios consolidados de crianza positiva (afecto, límites claros, sin castigo físico ni humillación), sin cifras, diagnósticos ni medicamentos.
- Si <contexto_del_colegio> o <curso> indican una edad o grado (por ejemplo adolescentes, grado transición, primaria), adapta TODO el reto a esa edad: actividades, lenguaje con el hijo y preguntas.
- Si viene <modulo>, el reto se publicará en ese módulo: debe encajar con él.
- Clasifica el tema en el eje y subtema más cercanos.
- Tono cálido y sin juicio, en español colombiano sencillo, para familias de cualquier nivel educativo. Tutea. Sin markdown.
- Si vienen <lineamientos_del_colegio>, son obligatorios: respeta el formato de entrega, las indicaciones y los temas prioritarios del grupo. Si el docente no dio tema, elige uno de los temas prioritarios o de los ejes que el grupo aún no ha trabajado.
- Breve, porque cabe en una tarea: "introduccion" máximo 50 palabras, dirigida a la familia; "objetivo" una frase; 3 a 5 "pasos" concretos (qué hacer, con quién, cuánto tiempo, con un ejemplo de qué decir) de máximo 30 palabras cada uno; 2 o 3 preguntas de "reflexion" para la entrega; 2 o 3 "criterios" de entrega sencillos (es un acompañamiento, no un examen).
- "titulo": corto y motivador, máximo 80 caracteres.
- "duracionDias": cuántos días necesita la familia para hacerlo bien (entre 5 y 15; normalmente 7).
- "moduloId": si vienen <modulos>, el id del módulo donde mejor encaja el reto, o "ninguno" si ninguno encaja.
- "busquedas": 1 o 2 recursos para que la familia profundice (video de YouTube o artículo) sobre el mismo tema: solo "titulo" y "consulta" de búsqueda (3 a 7 palabras). Nunca escribas enlaces.
- Si vienen <borrador_anterior> y <ajuste_pedido>, reescribe ese borrador aplicando SOLO el ajuste y conserva lo demás.`;

const schemaReto = (modulos) => ({
  type: 'object',
  additionalProperties: false,
  required: ['eje', 'subtema', 'titulo', 'introduccion', 'objetivo', 'pasos', 'reflexion', 'criterios', 'duracionDias', 'moduloId', 'busquedas'],
  properties: {
    eje: { type: 'string', enum: EJES_CRIANZA },
    subtema: { type: 'string', enum: [...Object.keys(SUBTEMAS), 'otro'] },
    titulo: { type: 'string' },
    introduccion: { type: 'string' },
    objetivo: { type: 'string' },
    pasos: { type: 'array', items: { type: 'string' } },
    reflexion: { type: 'array', items: { type: 'string' } },
    criterios: { type: 'array', items: { type: 'string' } },
    duracionDias: { type: 'integer' },
    moduloId: { type: 'string', enum: [...modulos.map((m) => String(m._id)), 'ninguno'] },
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
});

const DURACION_POR_DEFECTO = 7;
const duracionValida = (n) => (Number.isInteger(n) ? Math.min(15, Math.max(5, n)) : DURACION_POR_DEFECTO);

const escapar = (texto = '') => String(texto)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const lista = (items, tag) => `<${tag}>${items.map((i) => `<li>${escapar(i)}</li>`).join('')}</${tag}>`;

const listaRecursos = (recursos) => `<ul>${recursos.map((r) => `<li><a href="${escapar(r.url)}" target="_blank" rel="noopener noreferrer">${r.tipo === 'video' ? '🎬' : '📄'} ${escapar(r.titulo)}</a></li>`).join('')}</ul>`;

// HTML para el editor de la tarea; si no cabe en 2000 caracteres, quita primero
// los recursos y después recorta pasos y preguntas
export function armarDescripcionHtml({ introduccion, objetivo, pasos, reflexion, recursos = [] }) {
  let p = [...pasos];
  let r = [...reflexion];
  let rec = [...recursos];
  const armar = () => [
    `<p>${escapar(introduccion)}</p>`,
    `<p><strong>Objetivo:</strong> ${escapar(objetivo)}</p>`,
    '<p><strong>Qué hacer en casa esta semana:</strong></p>',
    lista(p, 'ol'),
    '<p><strong>Para tu entrega, cuéntanos:</strong></p>',
    lista(r, 'ul'),
    rec.length ? `<p><strong>Para profundizar:</strong></p>${listaRecursos(rec)}` : '',
    '<p><em>Escuela de padres · Diseñado con Edumon</em></p>',
  ].join('');

  let html = armar();
  while (html.length > MAX_DESCRIPCION && (rec.length || p.length > 2 || r.length > 1)) {
    if (rec.length) rec = rec.slice(0, -1);
    else if (p.length > 2) p = p.slice(0, -1);
    else r = r.slice(0, -1);
    html = armar();
  }
  return html.slice(0, MAX_DESCRIPCION);
}

const subtemaValido = (eje, subtema) => (SUBTEMAS_POR_EJE[eje]?.includes(subtema) ? subtema : null);

// sin IA: reto armado con la ficha más pertinente
const retoSimulado = (ficha, tema) => ({
  titulo: `Reto en familia: ${tema || ficha.titulo}`.slice(0, 80),
  introduccion: ficha.contenido.split('. ').slice(0, 2).join('. ').concat('.'),
  objetivo: `Poner en práctica en casa una estrategia de crianza positiva sobre ${(tema || ficha.titulo).toLowerCase()}.`,
  pasos: [
    'Lee con calma la introducción y piensa en un momento de la semana en que esto pasa en tu casa.',
    ficha.practica,
    'Repítelo al menos tres días de la semana y anota en una hoja cómo respondió tu hijo o hija.',
    'Al final de la semana, conversa en familia sobre qué funcionó y qué les gustaría seguir haciendo.',
  ],
  reflexion: ['¿Qué hiciste y cómo reaccionó tu hijo o hija?', '¿Qué fue lo más difícil y qué te funcionó?'],
  criterios: ['Cuenta con tus palabras qué hiciste en casa.', 'Comparte una reflexión de lo que aprendiste.'],
});

/**
 * Borrador de reto de escuela de padres. El tema puede ser libre ("tema") o
 * venir de la lista (eje/subtema). Devuelve null si no hay forma de generarlo
 * (sin IA y sin fichas del tema).
 */
export async function generarRetoEscuelaPadres({
  tema: temaPedido, eje: ejePedido, subtema, enfoque, curso, modulo, modulos = [], lineamientos = null, ajuste, borradorAnterior,
}) {
  // sin tema ni eje, pero con lineamientos: se parte de lo que el colegio pide para el grupo
  let tema = temaPedido;
  let eje = ejePedido;
  if (!tema && !eje && lineamientos) {
    if (lineamientos.temasPrioritarios?.length) [tema] = lineamientos.temasPrioritarios;
    else if (lineamientos.ejesFaltantes?.length) [eje] = lineamientos.ejesFaltantes;
  }
  if (!tema && !eje && borradorAnterior?.tema) tema = borradorAnterior.tema;
  // lineamientos sin temas ni ejes pendientes: el eje más general
  if (!tema && !eje) eje = 'crianza_amorosa';

  // el tema que escribió el docente manda sobre el eje elegido en la lista: si
  // se usaran las fichas de todo el eje, la IA mezclaría temas (ej. "mentiras"
  // con fichas de pantallas → "cena sin pantallas hablando la verdad")
  let temaDetectado = null;
  if (tema) {
    temaDetectado = detectarTema(tema);
    if (!temaDetectado && iaDisponible()) temaDetectado = (await clasificar(tema, [])).tema;
  }

  const ejeBase = temaDetectado?.eje || eje || null;
  const subtemaBase = temaDetectado?.subtema || (!tema && eje ? subtemaValido(eje, subtema) : null);

  // con tema libre, solo fichas de ese mismo subtema; sin tema libre, las del eje/subtema elegido
  const filtroFichas = subtemaBase
    ? { eje: ejeBase, subtema: subtemaBase }
    : (!tema && ejeBase ? { eje: ejeBase } : null);
  const fichas = filtroFichas
    ? await FichaCrianza.find({ activo: true, ...filtroFichas }).limit(5).lean()
    : [];
  const fuentes = [...new Set(fichas.map((f) => f.fuente.nombre))];
  const temaTexto = tema || SUBTEMAS[subtemaBase] || EJES_LABELS[ejeBase];

  // sin IA: módulo cuyo título comparte palabras con el tema; si hay uno solo, ese
  const moduloPorPalabras = () => {
    if (modulos.length === 1) return modulos[0]._id;
    const palabras = normalizar(`${temaTexto} ${SUBTEMAS[subtemaBase] ?? ''}`).split(/\W+/).filter((p) => p.length >= 4);
    return modulos.find((m) => palabras.some((p) => normalizar(m.titulo).includes(p)))?._id ?? null;
  };

  const resultado = (partes, generadoPor, ejeFinal, subtemaFinal, extra = {}) => {
    const recursos = armarRecursos(fichas, extra.busquedas ?? [{ tipo: 'video', titulo: `Videos sobre ${temaTexto.toLowerCase()}`, consulta: `${temaTexto} crianza` }]);
    return {
      eje: ejeFinal,
      subtema: subtemaFinal,
      tema: temaTexto,
      ...partes,
      recursos,
      duracionDias: duracionValida(extra.duracionDias),
      moduloIdSugerido: extra.moduloId ?? moduloPorPalabras(),
      descripcionHtml: armarDescripcionHtml({ ...partes, recursos }),
      criteriosHtml: lista(partes.criterios, 'ul'),
      fuentes,
      basadoEnFichas: fichas.length > 0,
      lineamientosAplicados: lineamientos ? { version: lineamientos.version, publicadoEn: lineamientos.publicadoEn } : null,
      generadoPor,
    };
  };

  if (!iaDisponible()) {
    if (!fichas.length) return null;
    return resultado(retoSimulado(fichas[0], tema), 'plantilla', ejeBase, subtemaBase);
  }

  try {
    const anterior = borradorAnterior && ajuste
      ? `<borrador_anterior>${JSON.stringify({
        titulo: borradorAnterior.titulo,
        introduccion: borradorAnterior.introduccion,
        objetivo: borradorAnterior.objetivo,
        pasos: borradorAnterior.pasos,
        reflexion: borradorAnterior.reflexion,
        criterios: borradorAnterior.criterios,
      })}</borrador_anterior>\n<ajuste_pedido>${ajuste}</ajuste_pedido>`
      : '';
    const contexto = [
      `<tema>${temaTexto}</tema>`,
      ejeBase ? `<eje_sugerido>${EJES_LABELS[ejeBase]}</eje_sugerido>` : '',
      curso ? `<curso>${curso}</curso>` : '',
      modulo ? `<modulo>${modulo}</modulo>` : '',
      modulos.length ? `<modulos>\n${modulos.map((m) => `- id ${m._id}: ${m.titulo}`).join('\n')}\n</modulos>` : '',
      enfoque ? `<contexto_del_colegio>${enfoque}</contexto_del_colegio>` : '',
      lineamientos?.texto ? `<lineamientos_del_colegio>\n${lineamientos.texto}\n</lineamientos_del_colegio>` : '',
      fichas.length
        ? ['<fichas>', ...fichas.map((f) => `<ficha>\nTítulo: ${f.titulo}\nEdades: ${f.edadMin}-${f.edadMax}\nContenido: ${f.contenido}\nPráctica: ${f.practica}\n</ficha>`), '</fichas>'].join('\n')
        : '<fichas>(no hay fichas para este tema)</fichas>',
      anterior,
    ].filter(Boolean).join('\n');

    const r = await completarJSON({
      system: SYSTEM_RETO,
      messages: [{ role: 'user', content: `${contexto}\n\n${anterior ? 'Aplica el ajuste al reto.' : 'Diseña el reto.'}` }],
      schema: schemaReto(modulos),
      nombre: 'reto_escuela_padres',
      esfuerzo: 'medium',
    });

    const ejeFinal = ejeBase || r.eje;
    const subtemaFinal = subtemaBase || subtemaValido(ejeFinal, r.subtema);
    const partes = {
      titulo: r.titulo.slice(0, 200),
      introduccion: r.introduccion,
      objetivo: r.objetivo,
      pasos: r.pasos,
      reflexion: r.reflexion,
      criterios: r.criterios,
    };
    const moduloId = modulos.find((m) => String(m._id) === r.moduloId)?._id ?? null;
    return resultado(partes, 'ia', ejeFinal, subtemaFinal, { duracionDias: r.duracionDias, moduloId, busquedas: r.busquedas });
  } catch (error) {
    console.error('[Edumon] Generador de retos IA falló:', error.message);
    if (!fichas.length) return null;
    return resultado(retoSimulado(fichas[0], tema), 'plantilla', ejeBase, subtemaBase);
  }
}
