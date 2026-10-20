import { createHash } from 'node:crypto';
import { classify, iaDisponible } from './proveedorIA.js';
import { analizarRiesgo, requiereAtencion, detectarTema, extraerEdad, pideHacerTarea, normalizar } from './reglas.js';
import { EJES_CRIANZA, CATEGORIAS_RIESGO, SUBTEMAS, SUBTEMAS_DESCRIPCION, SUBTEMAS_POR_EJE } from '../../config/edumonIA.js';

const listaSubtemas = Object.entries(SUBTEMAS_POR_EJE)
  .map(([eje, subtemas]) => subtemas.map((s) => `- ${eje} / ${s}: ${SUBTEMAS_DESCRIPCION[s]}`).join('\n'))
  .join('\n');

const SYSTEM_CLASIFICADOR = `Clasificas mensajes que madres, padres y cuidadores escriben a Edumon IA, el asistente de colegios colombianos que acompaña a las familias en la crianza, la vida escolar de sus hijos, sus emociones y su relación con el colegio. No respondes al cuidador: solo devuelves el JSON pedido. Clasificas el ÚLTIMO mensaje del cuidador, usando los anteriores solo como contexto.

pideResolverTarea: true si piden que Edumon haga, resuelva o responda una tarea, ejercicio, operación, ensayo, resumen, traducción o trabajo del colegio. Pedir consejos para acompañar las tareas NO cuenta (es "tareas_estudio"). Preguntas de crianza con números ("¿cuánto es normal que duerma?") tampoco.

nivelRiesgo:
- "riesgo": lo que el cuidador CUENTA que pasó o está pasando: maltrato físico por parte de un adulto (incluido el castigo físico "para corregir": chancla, correa, cachetadas, palmadas), maltrato psicológico grave (humillar, encerrar, amarrar), abuso sexual, violencia en la pareja, autolesión o ideación suicida (del niño o del cuidador) o negligencia grave.
- "atencion": malestar fuerte del cuidador (agotamiento, desesperación, tristeza persistente); señales de alarma del niño sin riesgo inmediato (aislamiento, deja de comer, consumo de drogas); o pregunta si está bien pegar sin contar que lo hace.
- "normal": dudas habituales de crianza.
NO es riesgo: exageraciones y frases hechas ("me va a matar si se entera", "me tiene loca", "lo voy a matar cuando llegue" dicho en broma), accidentes y enfermedades ("se fracturó jugando fútbol", "le sangra la nariz"), usos cotidianos de palabras ("abusa de los videojuegos", "se corta el pelo", "me tocó hacer fila"), que un compañero le pegue en el colegio (eso es acoso_escolar), que el niño pequeño pegue o muerda a sus padres (es conducta del niño: rabietas o limites), ni preguntar cómo enseñarle a cuidar su cuerpo.

gravedad (solo si nivelRiesgo es "riesgo"; si no, "ninguna"):
- "grave": abuso sexual, golpes que dejan lesiones (marcas, morados, sangre, quemaduras), riesgo de suicidio o autolesión, amenazas de muerte o con armas, peligro inmediato, negligencia grave (dejarlo solo días, no alimentarlo). Ante la duda en suicidio, autolesión o abuso sexual, elige "grave".
- "moderado": castigo físico sin lesiones, maltrato psicológico, violencia en la pareja sin peligro inmediato. La falta de comida o de dinero en el hogar es SIEMPRE "moderado" (categoría negligencia_grave): es pobreza, no descuido, y la familia decide si pide apoyo.

categoriaRiesgo: la que corresponda si nivelRiesgo es "riesgo"; si no, "ninguna". Elige la que describe lo que pasó, no el tema general: golpes o castigo físico son "maltrato_fisico"; "abuso_sexual" solo si hay contenido sexual.

eje y subtema: el tema de crianza de la consulta. Subtemas posibles (eje / subtema: qué cubre):
${listaSubtemas}
Si el último mensaje solo da una edad o sigue la conversación ("ya lo intenté y no funciona", "¿y si llora?"), el tema es el de la consulta previa. Si es solo un saludo, agradecimiento o despedida, o no encaja en ningún subtema, usa eje "fuera_de_alcance" y subtema "otro".

edad: la edad en años del hijo o hija del que se habla (meses → 0 si es menor de un año). Si se habla de otro hijo con otra edad, la de ese hijo. Si no aparece en la conversación, null.

Ejemplos (mensaje → nivelRiesgo, gravedad, categoriaRiesgo, eje/subtema):
- "mi hijo está abusando de los videojuegos" → normal, ninguna, ninguna, estilos_vida_saludable/pantallas
- "a veces le doy una palmada cuando no hace caso" → riesgo, moderado, maltrato_fisico, crianza_amorosa/disciplina_positiva
- "¿es malo darle una nalgada de vez en cuando?" → atencion, ninguna, ninguna, crianza_amorosa/disciplina_positiva (pregunta, no cuenta que lo hace)
- "el primo grande lo toca y le dijo que era un secreto" → riesgo, grave, abuso_sexual, fuera_de_alcance/otro
- "mi hijo dice que ojalá no despertara mañana" → riesgo, grave, autolesion_suicidio, crianza_amorosa/emociones
- "le pegué con la correa y le quedaron morados en las piernas" → riesgo, grave, maltrato_fisico, crianza_amorosa/disciplina_positiva
- "un compañero le pega en el recreo" → normal, ninguna, ninguna, garantia_derechos/acoso_escolar
- "mi niño de 3 años me pega cuando se enoja" → normal, ninguna, ninguna, crianza_amorosa/rabietas
- "¿cómo le explico a mi hija de 4 que nadie puede tocar sus partes íntimas?" → normal, ninguna, ninguna, educacion_sexualidad/sexualidad
- "mi hija de 15 dice que ya no quiere estar aquí y regala sus cosas" → riesgo, grave, autolesion_suicidio, crianza_amorosa/emociones
- "el novio de mi hija de 13 le pide fotos sin ropa" → riesgo, grave, abuso_sexual, educacion_sexualidad/sexualidad
- "se cayó en el parque y se fracturó el brazo" → normal, ninguna, ninguna, fuera_de_alcance/otro
- "mi esposo me grita y me humilla delante de los niños" → riesgo, moderado, violencia_intrafamiliar, fuera_de_alcance/otro
- "estoy agotada, ya no puedo más con los tres niños" → atencion, ninguna, ninguna, crianza_amorosa/autocuidado_cuidador
- "¿cómo hablo con la profesora sin que se moleste?" → normal, ninguna, ninguna, apoyo_procesos_educativos/relacion_colegio
- "mis hijos de 6 y 9 pelean todo el día" → normal, ninguna, ninguna, crianza_amorosa/hermanos
- "este mes no alcanza ni para el mercado" → riesgo, moderado, negligencia_grave, fuera_de_alcance/otro
- "mi suegra me va a matar si ve el desorden" → normal, ninguna, ninguna, fuera_de_alcance/otro
- "muchas gracias" → normal, ninguna, ninguna, fuera_de_alcance/otro`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nivelRiesgo', 'gravedad', 'categoriaRiesgo', 'eje', 'subtema', 'edad', 'pideResolverTarea'],
  properties: {
    nivelRiesgo: { type: 'string', enum: ['normal', 'atencion', 'riesgo'] },
    gravedad: { type: 'string', enum: ['ninguna', 'moderado', 'grave'] },
    categoriaRiesgo: { type: 'string', enum: ['ninguna', ...CATEGORIAS_RIESGO] },
    eje: { type: 'string', enum: [...EJES_CRIANZA, 'fuera_de_alcance'] },
    subtema: { type: 'string', enum: [...Object.keys(SUBTEMAS), 'otro'] },
    edad: { type: ['integer', 'null'] },
    pideResolverTarea: { type: 'boolean' },
  },
};

const RANGO = { grave: 2, moderado: 1 };
// el hallazgo más grave; a igual gravedad, el primero (las reglas seguras van primero)
const masGrave = (hallazgos) => hallazgos.filter(Boolean)
  .reduce((a, b) => (!a || RANGO[b.gravedad] > RANGO[a.gravedad] ? b : a), null);

const clasificarPorReglas = (textoActual, textoContexto) => {
  const { seguro, dudoso } = analizarRiesgo(textoActual);
  return {
    categoriaRiesgo: seguro?.categoria ?? null,
    gravedad: seguro?.gravedad ?? null,
    // sin IA que lo confirme, un indicio dudoso solo agrega la nota de orientación
    atencion: requiereAtencion(textoActual) || Boolean(dudoso),
    // el tema puede venir de un mensaje anterior ("8 años" responde a la consulta previa)
    tema: detectarTema(textoActual) || detectarTema(textoContexto),
    edad: extraerEdad(textoActual),
    pideHacerTarea: pideHacerTarea(textoActual),
    fuente: 'reglas',
    riesgoReglas: { seguro, dudoso },
  };
};

// por qué no respondió la IA, en claro y sin datos de la cuenta del proveedor
// (se guarda en la alerta y lo ve el colegio)
export const motivoFalloIA = (mensaje = '') => {
  if (/tokens per day|requests per day/i.test(mensaje)) return 'Se agotó la cuota diaria del proveedor de IA';
  if (/No hay proveedor/i.test(mensaje)) return 'No hay proveedor de IA configurado';
  if (/429|rate limit/i.test(mensaje)) return 'Límite de uso por minuto del proveedor de IA';
  if (/ 40[13]\b|llave/i.test(mensaje)) return 'Llave del proveedor de IA inválida o vencida';
  if (/timeout|aborted/i.test(mensaje)) return 'El proveedor de IA no respondió a tiempo';
  if (/ 5\d\d\b/.test(mensaje)) return 'El proveedor de IA tuvo un error interno';
  if (/cooldown/i.test(mensaje)) return 'Proveedores de IA en pausa por fallos recientes (cooldown)';
  if (/fetch failed|ENOTFOUND|ECONN| red:/i.test(mensaje)) return 'Sin conexión con el proveedor de IA';
  return 'Error del proveedor de IA';
};

// caché de clasificaciones del LLM por hash del mensaje normalizado (más el
// contexto reciente, que cambia el tema de un seguimiento). Solo guarda
// resultados del LLM: si el proveedor se recupera, no se repite un fallback.
const cache = new Map();
const MAX_CACHE = 500;
const ttlCacheMs = () => (Number(process.env.LLM_CACHE_TTL_SECONDS) > 0 ? Number(process.env.LLM_CACHE_TTL_SECONDS) : 600) * 1000;
const claveCache = (texto, contexto) => createHash('sha256').update(`${normalizar(texto)}\u0000${normalizar(contexto)}`).digest('hex');
const leerCache = (clave) => {
  const item = cache.get(clave);
  if (!item) return null;
  if (item.vence < Date.now()) { cache.delete(clave); return null; }
  return item.valor;
};
const guardarCache = (clave, valor) => {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(clave, { valor, vence: Date.now() + ttlCacheMs() });
};
// solo para pruebas
export const _limpiarCacheClasificaciones = () => cache.clear();

// qué se detectó y quién decidió: queda guardado en el mensaje y en la alerta
// para poder explicar (y auditar) cada clasificación
const armarDeteccion = ({ fuente, riesgoReglas, llm = null, riesgo, dudosoConfirmado = null, errorIA = null, modeloUsado = null, llamada = null }) => ({
  fuente,
  modelo: fuente === 'ia' ? modeloUsado : null,
  // qué proveedor respondió, cuánto tardó y si antes falló otro
  proveedor: llamada?.proveedor ?? null,
  latenciaMs: llamada?.latenciaMs ?? null,
  huboFallback: Boolean(llamada?.huboFallback),
  proveedoresFallidos: [...new Set((llamada?.intentos ?? []).map((i) => i.proveedor))],
  desdeCache: false,
  reglaSegura: riesgoReglas.seguro,
  reglaDudosa: riesgoReglas.dudoso,
  llm,
  decidio: !riesgo ? null
    : riesgo === riesgoReglas.seguro ? 'regla'
      : riesgo === dudosoConfirmado ? 'regla_confirmada_por_ia'
        : 'ia',
  errorIA,
});

/**
 * @param {string} textoActual   último mensaje del cuidador
 * @param {Array<{rol, contenido}>} historial mensajes previos de la conversación
 * @returns {{categoriaRiesgo: string|null, gravedad: string|null, atencion: boolean, tema: {eje, subtema}|null, edad: number|null, pideHacerTarea: boolean, fuente: string}}
 */
export async function clasificar(textoActual, historial = []) {
  const textoContexto = historial
    .filter((m) => m.rol === 'usuario')
    .slice(-3)
    .map((m) => m.contenido)
    .join(' ');

  const { riesgoReglas, ...porReglas } = clasificarPorReglas(textoActual, textoContexto);
  const soloReglas = (errorIA = null, intentos = []) => ({
    ...porReglas,
    // con intentos fallidos el respaldo por reglas queda explícito, nunca en silencio
    huboFallback: intentos.length > 0,
    deteccion: armarDeteccion({
      fuente: 'reglas', riesgoReglas, riesgo: riesgoReglas.seguro, errorIA,
      llamada: intentos.length ? { huboFallback: true, intentos } : null,
    }),
  });
  if (!iaDisponible()) return soloReglas();

  const clave = claveCache(textoActual, textoContexto);
  const enCache = leerCache(clave);
  if (enCache) return { ...enCache, deteccion: { ...enCache.deteccion, desdeCache: true, latenciaMs: 0 } };

  try {
    const mensajes = [
      ...historial.slice(-6).map((m) => ({
        role: m.rol === 'usuario' ? 'user' : 'assistant',
        content: m.contenido,
      })),
      { role: 'user', content: textoActual },
    ];
    const llamada = await classify({
      system: SYSTEM_CLASIFICADOR,
      messages: mensajes,
      schema: SCHEMA,
      nombre: 'clasificacion_edumon',
    });
    const { datos: r, modelo: modeloUsado } = llamada;

    const llmVeRiesgo = r.nivelRiesgo === 'riesgo';
    const categoriaLLM = llmVeRiesgo && r.categoriaRiesgo !== 'ninguna' ? r.categoriaRiesgo : null;
    // negligencia grave (aviso automático) solo con hechos que detectan las reglas
    // (dejarlo solo días); el modelo tiende a llamar "grave" a la pobreza
    const graveLLM = r.gravedad === 'grave' && !(categoriaLLM === 'negligencia_grave' && riesgoReglas.seguro?.gravedad !== 'grave');
    const hallazgoLLM = categoriaLLM && { categoria: categoriaLLM, gravedad: graveLLM ? 'grave' : 'moderado' };
    // la regla segura manda siempre; la dudosa solo si el modelo también ve riesgo,
    // y solo es grave si el modelo también lo ve grave
    const dudosoConfirmado = llmVeRiesgo && riesgoReglas.dudoso
      && { categoria: riesgoReglas.dudoso.categoria, gravedad: hallazgoLLM?.gravedad ?? 'moderado' };
    const riesgo = masGrave([riesgoReglas.seguro, dudosoConfirmado, hallazgoLLM]);
    const temaLLM = r.eje !== 'fuera_de_alcance' && r.subtema !== 'otro' && SUBTEMAS_POR_EJE[r.eje]?.includes(r.subtema)
      ? { eje: r.eje, subtema: r.subtema }
      : null;

    const resultado = {
      categoriaRiesgo: riesgo?.categoria ?? null,
      gravedad: riesgo?.gravedad ?? null,
      atencion: requiereAtencion(textoActual) || r.nivelRiesgo === 'atencion' || (llmVeRiesgo && !riesgo),
      // si el modelo dice "fuera de alcance" (saludo, gracias) no se fuerza el tema de las reglas
      tema: r.eje === 'fuera_de_alcance' ? detectarTema(textoActual) : (temaLLM || porReglas.tema),
      edad: r.edad ?? porReglas.edad,
      pideHacerTarea: porReglas.pideHacerTarea || r.pideResolverTarea,
      fuente: 'ia',
      proveedor: llamada.proveedor,
      huboFallback: llamada.huboFallback,
      deteccion: armarDeteccion({
        fuente: 'ia',
        riesgoReglas,
        llm: { nivelRiesgo: r.nivelRiesgo, gravedad: r.gravedad, categoria: r.categoriaRiesgo },
        riesgo,
        dudosoConfirmado,
        modeloUsado,
        llamada,
      }),
    };
    guardarCache(clave, resultado);
    return resultado;
  } catch (error) {
    console.error('[Edumon] Ningún proveedor de IA clasificó, uso reglas:', error.message);
    return soloReglas(motivoFalloIA(error.message), error.intentos ?? []);
  }
}
