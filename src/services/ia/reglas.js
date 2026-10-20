// Reglas por palabras clave. Cumplen dos funciones:
// 1. Red de seguridad de riesgo: corre SIEMPRE, también cuando haya LLM, para
//    que un caso grave no dependa solo del criterio del modelo.
// 2. Clasificador del modo simulado (sin GROQ_API_KEY).
//
// Los patrones se comparan contra el texto normalizado (minúsculas, sin tildes).
// Un patrón de texto se busca al INICIO de una palabra: "suicid" encuentra
// "suicidarse", pero "notas" ya no aparece dentro de "anotas". También se
// admiten expresiones regulares para frases con contexto.

export const normalizar = (texto = '') => texto
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compilar = (patron) => (patron instanceof RegExp
  ? patron
  : new RegExp(`(?:^|[^a-z0-9])${escaparRegex(patron)}`));

const P = (patrones) => patrones.map(compilar);

const contieneAlguno = (texto, patrones) => patrones.some((p) => p.test(texto));

// ─── Riesgo ───────────────────────────────────────────────────────────────────
// GRAVE → aviso automático (está en juego la vida o la integridad del niño, y la
// ley obliga a reportar). MODERADO → Edumon ofrece ayuda y solo avisa si la
// familia la pide: avisar por todo haría que las familias dejaran de contar.
//
// seguro: la frase por sí sola basta. Las "dudosas" también aparecen en charlas
// cotidianas ("se corta el pelo", "un niño lo golpeó en el colegio"): con IA solo
// cuentan si el modelo confirma el riesgo; sin IA quedan en "atención" (respuesta
// normal con la nota de orientación escolar), sin alerta ni oferta de aviso.

// otros niños o el colegio: golpes así son acoso escolar, no maltrato en casa
const CONTEXTO_PARES = P([
  'companer', 'otro nino', 'otra nina', 'otros ninos', 'otras ninas', 'un nino', 'una nina',
  'en el colegio', 'en la escuela', 'en el recreo', 'en el salon', 'en clase', 'en el bus',
  'en el jardin', 'en el parque', 'en la ruta',
]);
// con un objeto no hay duda de quién castiga, aunque se mencione el colegio
const INSTRUMENTOS = P([
  'chancla', 'correa', 'cuero', 'cable', 'palo', 'fuete', 'regla de madera', 'cinturon', 'manguera',
]);
const NEGACION_GOLPE = /\b(no|nunca|jamas)\s+(le|lo|la|les|los)\s+(pego|pegue|he pegado|golpeo|golpee|doy|di|he dado)\b/;
// el que pega es el niño (a sus padres o a otros), no la pareja
const SUJETO_HIJO = /\bmi (hij|nin|bebe|chiquit|pelad|muchach|nene)/;
const PAREJA = /\b(espos[oa]|marido|mujer|pareja|novi[oa]|compañer[oa]|companer[oa]|ex|papa de mis|mama de mis|padrastro|madrastra)\b/;

const LESIONES = P([
  'sangr', 'moreton', 'morado', 'morada', 'marcas', 'fractur', 'hueso roto', 'quemadura', 'herida',
  'chichon', 'hinchad', 'al hospital', 'a urgencias', 'no podia caminar', 'se desmayo',
]);
const GOLPE_CUIDADOR = P([
  'le pegue', 'le pego', 'lo golpee', 'la golpee', 'lo golpeo', 'la golpeo', 'le di con', 'le doy con',
  'le di un golpe', 'le di una cachetada', 'le di una pela', 'paliza', 'golpiza', 'muenda', 'correazo',
  'chancletazo', 'cuerazo', 'fuetazo', 'lo empuje', 'la empuje', 'lo tire', 'la tire', 'lo sacudi', 'la sacudi',
  'con la correa', 'con la chancla', 'con el cuero', 'con el cable', 'con el palo', 'con el cinturon',
]);
const primeraCoincidencia = (t, patrones) => patrones.map((p) => t.match(p)?.[0].trim()).find(Boolean);

// golpe del cuidador que deja lesión: grave (con o sin palabra "paliza").
// Devuelve las dos frases que lo evidencian ("con la correa + morados") o false
const golpeConLesion = (t) => {
  const golpe = primeraCoincidencia(t, GOLPE_CUIDADOR);
  const lesion = primeraCoincidencia(t, LESIONES);
  if (!golpe || !lesion) return false;
  if (contieneAlguno(t, CONTEXTO_PARES) && !contieneAlguno(t, INSTRUMENTOS)) return false;
  return `${golpe} + ${lesion}`;
};

// "le enseñaron a prevenir el abuso sexual" habla de prevención, no de un caso
const PREVENCION = /\b(prevenir|prevencion|previene|charla|taller|ensenaron|ensenarle|explicarle|hablarle)\b[^.?!]{0,40}\babuso sexual\b/;

// "¿un chancletazo de vez en cuando es malo?" pregunta, no cuenta que lo hace
const preguntaSinContar = (t) => t.includes('?')
  && /\b(es malo|esta mal|esta bien|es bueno|se vale|sirve|funciona)\b/.test(t)
  && !/\b(le|les|lo|la) (doy|di|pego|pegue|golpeo|golpee)\b/.test(t);

const ZONAS_INTIMAS = '(partes intimas|parte intima|partes privadas|sus partes|genital\\w*|vagina|pene|pipi|cuca|vulva|senos|pechos|nalgas)';

const REGLAS_RIESGO = [
  // ══ GRAVE ══
  {
    categoria: 'autolesion_suicidio', gravedad: 'grave', seguro: true,
    patrones: P([
      'quiere morir', 'quiero morir', 'quiere morirse', 'quiero morirme', 'ganas de morir',
      'se quiere matar', 'quiere matarse', 'me quiero matar', 'quiero matarme', 'pensando en matarse',
      'pensando en matarme', 'suicid', 'quitarse la vida', 'quitarme la vida', 'autolesi',
      'no quiere vivir', 'no quiero vivir', 'ya no quiere vivir', 'ya no quiero vivir', 'no vale la pena vivir',
      'mejor muerto', 'mejor muerta', 'estar muerto', 'estar muerta', 'quiere hacerse dano', 'quiero hacerme dano',
      'se hace dano a proposito', 'se lastima a proposito', 'se hace cortes', 'se quiere tirar por', 'se quiere lanzar',
      /\bse (esta )?cort\w* (los|las|el|la|sus) (brazo|brazos|muneca|munecas|pierna|piernas|piel|venas)\b/,
      /\bcortes en (los|las|el|la|sus) (brazo|brazos|muneca|munecas|pierna|piernas)\b/,
      /\bcortarse (los|las) (brazos|venas|munecas)\b/,
      'para hacerse dano', 'para hacerme dano', /\bno (quiero|quiere) seguir (viviendo|vivo|viva)\b/,
      /\bse (va a|quiere|iba a) (tirar|lanzar|botar) (de|por|desde)\b/,
    ]),
  },
  {
    categoria: 'abuso_sexual', gravedad: 'grave', seguro: true,
    patrones: P([
      'abuso sexual', 'abusos sexuales', 'acoso sexual', 'tocamiento', 'violacion', 'la violaron', 'lo violaron',
      'la violo', 'lo violo', 'fue violada', 'fue violado', 'la manose', 'lo manose', 'grooming',
      /\bviolar(on|o) a (mi|mis|su|sus|la|el|un|una)\b/,
      /\b(mensajes|chats|fotos|videos|audios)\s+(sexuales|eroticos|obscenos)\b/,
      /\babus\w*\s+(sexualmente\s+)?(de|a)\s+(mi|mis|su|sus|la|el|una|un)\s+(hij|nin|nen|bebe|sobrin|niet|chiquit|pelad|muchach|alumn|estudiant)/,
      /\babusaron de (el|ella)\b/,
      /\b(lo|la|los|las|me)\s+abus(o|aron|a|an|ando|aba|aban)\b/,
      new RegExp(`\\b(toc|manose|sob)\\w*\\b[^.?!]{0,40}\\b${ZONAS_INTIMAS}\\b`),
      /\b(pidio|pide|piden|pidieron|mando|manda|mandaron|envio|envia|mostro|muestra|mostraron)\b[^.?!]{0,30}\b(fotos?|videos?|imagenes)\b[^.?!]{0,25}\b(desnud\w*|intim\w*|sin ropa|porno\w*|sexual\w*|en ropa interior)/,
    ]),
    // "violación de sus derechos" no es abuso sexual
    excluir: (t) => (/\bviolacion de (sus|los|mis|tus) derechos\b/.test(t)
      && !/\b(la|lo) violaron\b|\bfue violad/.test(t))
      || PREVENCION.test(t),
  },
  {
    categoria: 'maltrato_fisico', gravedad: 'grave', seguro: true,
    patrones: P([
      'paliza', 'golpiza', 'lo queme', 'la queme', 'le queme',
      /\b(le|lo|la) quem(o|aron|aba)\b[^.?!]{0,40}\b(cigarr\w*|plancha|cuchara|agua hirviendo|agua caliente|encendedor|fosforo)/,
      /\b(le|lo|la) (pega|golpea|pegaba|golpeaba)\b[^.?!]{0,40}\b(deja|dejo|dejan|quedan|quedaron|queda) (marcas|morados|moretones|heridas)/,
    ]),
    prueba: golpeConLesion,
    excluir: (t) => NEGACION_GOLPE.test(t) || (contieneAlguno(t, CONTEXTO_PARES) && !contieneAlguno(t, INSTRUMENTOS)),
  },
  {
    categoria: 'violencia_intrafamiliar', gravedad: 'grave', seguro: true,
    patrones: P([
      'me amenaza con matar', 'me amenazo con matar', 'amenaza con matarme', 'amenazo con matarme',
      'amenaza con matarnos', 'amenazo con matarnos', 'nos amenaza con matar', 'nos amenazo con matar',
      'me intento matar', 'nos intento matar', 'intento ahorcarme', 'me ahorca', 'me ahorco',
      /\b(amenaz\w*|apunt\w*)\b[^.?!]{0,40}\b(arma|pistola|revolver|cuchillo|machete)\b/,
      /\b(arma|pistola|revolver|cuchillo|machete)\b[^.?!]{0,40}\bamenaz/,
      /\bmatar\w*\b[^.?!]{0,30}\b(arma|pistola|revolver|cuchillo|machete)\b/,
    ]),
  },
  {
    categoria: 'negligencia_grave', gravedad: 'grave', seguro: true,
    patrones: P([
      /\b(lo|la|los|las) (dejo|deje|dejamos) (solo|sola|solos|solas) (varios dias|toda la noche|todo el fin de semana|dias enteros)\b/,
      /\b(llevan|lleva|pasaron|estuvieron|quedaron) (\w+ )?(dias|noches) (solos|solas|solo|sola)\b/,
    ]),
  },
  // grave dudoso
  {
    categoria: 'autolesion_suicidio', gravedad: 'grave', seguro: false,
    patrones: P(['hacerse dano', 'se corta', 'cortarse', 'quiere desaparecer', 'quisiera desaparecer', 'no quiere despertar', 'carta de despedida']),
  },
  {
    categoria: 'abuso_sexual', gravedad: 'grave', seguro: false,
    patrones: P(['lo toco', 'la toco', 'lo tocaron', 'la tocaron', 'lo toca ', 'la toca ', 'abuso de ella']),
  },
  {
    categoria: 'violencia_intrafamiliar', gravedad: 'grave', seguro: false,
    patrones: P(['me va a matar', 'nos va a matar', 'tiene un arma']),
  },
  {
    categoria: 'negligencia_grave', gravedad: 'grave', seguro: false,
    patrones: P(['no ha comido en dias', 'lleva dias sin comer', 'no le doy de comer']),
  },

  // ══ MODERADO ══
  {
    // castigo físico sin lesiones (prohibido por la Ley 2089 de 2021): se educa y se ofrece ayuda
    categoria: 'maltrato_fisico', gravedad: 'moderado', seguro: true,
    patrones: P([
      'yo le pego', 'a veces le pego', 'le pego con', 'le pegue con', 'le doy con', 'le di con', 'le doy palo',
      'le di palo', 'le pego duro', 'le pegue duro', 'correazo', 'chancletazo', 'cuerazo', 'fuetazo', 'muenda',
      'una pela', 'le doy una pela', 'le di una pela', 'con la chancla', 'con la correa', 'con el cuero',
      'con el cable', 'con el palo', 'con el cinturon', 'con la manguera', 'le doy cachetadas', 'le doy una cachetada',
      'le di una cachetada', 'le jalo las orejas', 'le jale las orejas', 'le jalo el pelo', 'le jale el pelo',
    ]),
    excluir: (t) => NEGACION_GOLPE.test(t) || preguntaSinContar(t)
      || (contieneAlguno(t, CONTEXTO_PARES) && !contieneAlguno(t, INSTRUMENTOS)),
  },
  {
    categoria: 'violencia_intrafamiliar', gravedad: 'moderado', seguro: true,
    patrones: P([
      'violencia intrafamiliar', 'violencia domestica', 'violencia de pareja',
      /\bmi (espos[oa]|marido|mujer|pareja|novi[oa]|companer[oa]|ex)\b[^.?!]{0,30}\b(me|nos)\s+(pega|pego|golpea|golpeo|maltrata|maltrato|empuja|empujo|humilla|amenaza|insulta)\b/,
    ]),
  },
  {
    categoria: 'maltrato_psicologico', gravedad: 'moderado', seguro: true,
    patrones: P([
      'lo encierro', 'la encierro', 'lo amarro', 'la amarro', 'lo amarre', 'la amarre', 'lo humillo', 'la humillo',
      'le digo que no sirve para nada', 'le digo bruto', 'le digo bruta', 'le digo inutil', 'le digo estupid',
      'ojala no hubiera nacido', 'no debio nacer', 'lo dejo sin comer', 'la dejo sin comer',
      'lo deje sin comer', 'la deje sin comer',
      /\ble (dice|dijo|grita|grito|digo)\b[^.?!]{0,30}\b(estupid\w*|bruto|bruta|inutil|idiota)\b/,
    ]),
    excluir: (t) => contieneAlguno(t, CONTEXTO_PARES),
  },
  {
    categoria: 'negligencia_grave', gravedad: 'moderado', seguro: true,
    patrones: P([
      'no tenemos que comer', 'no tenemos comida', 'no hay comida en la casa', 'no hay que comer',
      /\bno (tengo|tenemos|me alcanza|nos alcanza|alcanza)\b[^.?!]{0,20}\b(plata|dinero|para)\b[^.?!]{0,15}\b(la comida|comer|el mercado)\b/,
    ]),
  },
  // moderado dudoso
  {
    categoria: 'maltrato_fisico', gravedad: 'moderado', seguro: false,
    patrones: P([
      'lo golpeo', 'la golpeo', 'lo golpee', 'la golpee', 'le pego cuando', 'le pego porque', 'le pegue porque',
      'le pegue cuando', 'cachetada', 'nalgada', 'palmada', 'pellizc', 'jalon de orejas', 'jalon de pelo',
      'castigo fisico',
    ]),
    excluir: (t) => NEGACION_GOLPE.test(t) || contieneAlguno(t, CONTEXTO_PARES),
  },
  {
    categoria: 'violencia_intrafamiliar', gravedad: 'moderado', seguro: false,
    patrones: P(['me golpea', 'nos golpea', 'me pega', 'nos pega', 'me maltrata', 'nos maltrata']),
    // "mi hijo me pega cuando se enoja" es conducta del niño, no violencia de pareja
    excluir: (t) => SUJETO_HIJO.test(t) && !PAREJA.test(t),
  },
];

// el fragmento del mensaje que activó la regla (para explicar la alerta), o null
const coincidencia = (t, regla) => {
  if (regla.excluir?.(t)) return null;
  for (const p of regla.patrones) {
    const m = t.match(p);
    // se completa la última palabra ("abusaron de mi hij" → "... hija") para que se lea bien
    if (m) return t.slice(m.index, m.index + m[0].length + (t.slice(m.index + m[0].length).match(/^[a-z]*/)?.[0].length ?? 0)).trim();
  }
  return regla.prueba?.(t) || null;
};

const RANGO = { grave: 2, moderado: 1 };
const mayor = (a, b) => (!a ? b : !b ? a : RANGO[b.gravedad] > RANGO[a.gravedad] ? b : a);

/**
 * Análisis completo para combinar con la IA.
 * { seguro: {categoria, gravedad, patron} | null, dudoso: {categoria, gravedad, patron} | null }
 */
export const analizarRiesgo = (texto) => {
  const t = normalizar(texto);
  let seguro = null;
  let dudoso = null;
  for (const regla of REGLAS_RIESGO) {
    const patron = coincidencia(t, regla);
    if (!patron) continue;
    const hallazgo = { categoria: regla.categoria, gravedad: regla.gravedad, patron };
    if (regla.seguro) seguro = mayor(seguro, hallazgo);
    else dudoso = mayor(dudoso, hallazgo);
  }
  return { seguro, dudoso };
};

/**
 * Veredicto solo con reglas (modo simulado): cuenta lo seguro; lo dudoso
 * no es riesgo (ver hayIndicioDudoso). { categoria, gravedad } o null
 */
export const evaluarRiesgo = (texto) => analizarRiesgo(texto).seguro;

export const hayIndicioDudoso = (texto) => Boolean(analizarRiesgo(texto).dudoso);

export const detectarRiesgo = (texto) => evaluarRiesgo(texto)?.categoria ?? null;

// ─── Atención (responde normal y sugiere orientación, sin alerta) ─────────────
// malestar fuerte del cuidador, señales de alarma del niño, o preguntar si pegar
// está bien sin contar que lo hace
const PATRONES_ATENCION = P([
  'no puedo mas', 'ya no aguanto', 'no aguanto mas', 'estoy desesperad', 'estoy agotad', 'me siento agotad', 'estoy al limite',
  /\bme siento (muy |tan )?(sola|solo)\b/, 'me siento fracasad', 'lloro todas las noches', 'no puedo con esto',
  'chancletazo', 'correazo', 'castigo fisico', 'soy mala madre', 'soy mala mama', 'soy un mal padre',
  'soy mal padre', 'ansiedad', 'ataques de panico', 'deprimid', 'depresion', 'triste todo el tiempo',
  'lloro todos los dias', 'lloro todo el tiempo', 'no tengo ganas de nada', 'pegarle', 'pegarles',
  'se provoca el vomito', 'vomita a proposito', 'dejo de comer', 'no sale de su cuarto', 'se aisla',
  'marihuana', 'drogas', 'perico', 'se emborracha',
]);

export const requiereAtencion = (texto) => contieneAlguno(normalizar(texto), PATRONES_ATENCION);

// ─── Temas (eje del Decreto 459 + subtema de las fichas) ──────────────────────
// El orden importa: gana el primer tema que coincida, así que los más
// específicos van antes que los generales.
const TEMAS = [
  // antes que disciplina: "un compañero le pegó" es acoso, no castigo
  { eje: 'garantia_derechos', subtema: 'acoso_escolar',
    patrones: ['bullying', 'matoneo', 'acoso escolar', 'se burlan', 'le pegan en el colegio', 'le pegan en el recreo',
      'lo molestan', 'la molestan', 'ciberacoso', 'lo excluyen', 'la excluyen', 'no lo dejan jugar', 'no la dejan jugar',
      'le dicen apodos', 'le ponen apodos', 'se la montan', 'le quitan las cosas', 'molesta a sus companeros',
      'molesta a otros ninos', 'le pega a sus companeros', 'le pega a otros ninos', 'un companero le pego', 'burla',
      'molestando',
      'unos companeros', 'sus companeros le'] },
  { eje: 'crianza_amorosa', subtema: 'disciplina_positiva',
    patrones: ['pegarle', 'le pego', 'le pegue', 'correa', 'chancla', 'castigo', 'castigar', 'castigarlo', 'castigarla',
      'le grite', 'gritarle', 'le grito', 'perdi la paciencia', 'pierdo la paciencia', 'regan', 'cachetada', 'nalgada', 'palmada',
      'chancletazo', 'correazo', 'cinturon'] },
  { eje: 'apoyo_procesos_educativos', subtema: 'rechazo_escolar',
    patrones: ['no quiere ir al colegio', 'no quiere ir a estudiar', 'no quiere ir a la escuela', 'no quiere ir al jardin',
      'llora para ir al colegio', 'llora al dejarlo', 'llora al dejarla', 'llora cuando lo dejo', 'llora cuando la dejo',
      'adaptacion al jardin', 'adaptacion al colegio', 'no quiere entrar al colegio', 'no quiere entrar al salon',
      'no quiere entrar a clase', /\b(jardin|colegio|escuela|salon)\b[^.?!]{0,30}\bllora\b/] },
  { eje: 'estilos_vida_saludable', subtema: 'consumo_sustancias',
    patrones: ['alcohol', 'trago', 'cerveza', 'fuma', 'cigarr', 'vape', 'vapea', 'vapeador', 'marihuana', 'droga', 'perico', 'se emborrach', 'borrach'] },
  { eje: 'crianza_amorosa', subtema: 'cambios_familiares',
    patrones: ['separacion', 'nos separamos', 'me separe', 'divorci', 'murio', 'fallecio', 'duelo', 'muerte de',
      'nos mudamos', 'mudanza', 'mudar', 'mudarnos', 'cambio de colegio', 'cambio de ciudad', 'cambiamos de colegio', 'padrastro', 'madrastra',
      'nueva pareja', 'su papa se fue', 'su mama se fue', 'no ve a su papa', 'no ve a su mama', 'migramos',
      'migracion', 'migrante', 'emigr', 'se fue del pais'] },
  { eje: 'crianza_amorosa', subtema: 'hermanos',
    patrones: ['hermano', 'hermana', 'hermanito', 'hermanita', /\bmis hij(o|a)s\b[^.?!]{0,25}\b(se )?pelean\b/, 'pelean entre ellos',
      'celos del bebe', 'nuevo bebe', 'va a tener un hermanito'] },
  { eje: 'educacion_sexualidad', subtema: 'sexualidad',
    patrones: ['sexualidad', 'menstru', 'le llego la regla', 'le bajo la regla', 'primera regla', 'novio', 'novia', 'pubertad',
      'su cuerpo', 'partes intimas', 'preguntas sobre sexo', 'de donde vienen los bebes', 'masturb', 'se toca', 'porno',
      'anticoncep', 'condon', 'embaraz', 'orientacion sexual', 'gay', 'lgbt', 'identidad de genero', 'relaciones sexuales'] },
  { eje: 'estilos_vida_saludable', subtema: 'pantallas',
    patrones: ['celular', 'pantalla', 'tablet', 'videojuego', 'juegos en linea', 'redes sociales', 'tiktok', 'youtube',
      'television', 'free fire', 'roblox', 'minecraft', 'fortnite', 'play station', 'playstation', 'xbox', 'nintendo',
      'instagram', 'whatsapp', 'computador', 'el telefono'] },
  { eje: 'crianza_amorosa', subtema: 'rabietas',
    patrones: ['rabieta', 'berrinche', 'pataleta', 'se tira al piso', 'llora y grita', 'explota de rabia', 'ataques de rabia'] },
  { eje: 'crianza_amorosa', subtema: 'limites',
    patrones: ['no hace caso', 'no me hace caso', 'desobedece', 'limites', 'normas', 'reglas en casa', 'reglas de la casa',
      'me reta', 'contesta feo', 'contesta mal', 'groser', 'malas palabras', 'miente', 'mentiras', 'mentir', 'agresiv',
      'muerde', 'malcriad', 'consentid', 'capricho', 'permisos', 'hora de llegada'] },
  { eje: 'apoyo_procesos_educativos', subtema: 'tareas_estudio',
    patrones: ['tarea', 'estudiar', 'malas notas', 'bajas notas', 'notas', 'rendimiento', 'perdio el ano', 'perdiendo materias',
      'perdio materias', 'concentrarse', 'se distrae', 'no se concentra', 'examen', 'evaluaciones', 'le va mal en el colegio',
      'no le gusta leer', 'habitos de estudio', 'horas de estudio', 'no sabe leer', 'le cuesta leer',
      /\bperdi\w* (\w+ )?materias\b/] },
  { eje: 'apoyo_procesos_educativos', subtema: 'relacion_colegio',
    patrones: ['docente', 'profesor', 'profesora', 'maestra', 'maestro', 'reunion de padres', 'citacion', 'me citaron',
      'me llamaron del colegio', 'coordinador', 'rector', 'hablar con el colegio', 'quejas del colegio', 'observador',
      'anotacion', 'orientadora', 'orientador', 'directora de grupo', 'director de grupo'] },
  { eje: 'apoyo_procesos_educativos', subtema: 'rutinas_organizacion',
    patrones: ['las mananas', 'en la manana', 'llega tarde', 'organizar', 'organizo', 'organice', 'organizacion', 'rutina',
      'horario', 'se le olvida', 'olvida los cuadernos', 'olvida las cosas', 'desordenad', 'la maleta', 'los utiles',
      'madrugar', 'levantarse'] },
  { eje: 'crianza_amorosa', subtema: 'comunicacion_adolescentes',
    patrones: ['adolescente', 'no me habla', 'no me cuenta nada', 'ya no me cuenta', 'encerrado en su cuarto',
      'encerrada en su cuarto', 'no quiere hablar', 'rebelde', 'no me tiene confianza', 'se encierra'] },
  { eje: 'estilos_vida_saludable', subtema: 'sueno',
    patrones: ['dormir', 'duerma', 'duerme', 'sueno', 'se despierta', 'pesadillas', 'acostarse', 'se acuesta',
      'moja la cama', 'se orina en la cama'] },
  { eje: 'estilos_vida_saludable', subtema: 'alimentacion',
    patrones: ['no come', 'no quiere comer', 'come muy poco', 'comida', 'comer', 'alimentacion', 'solo come dulces',
      'lonchera', 'onces', 'refrigerio', 'verduras', 'comer sano', 'sobrepeso', 'obesidad'] },
  { eje: 'crianza_amorosa', subtema: 'autocuidado_cuidador',
    patrones: ['estoy agotad', 'me siento agotad', 'sin paciencia', 'no puedo mas', 'estoy cansad', /\bme siento (muy |tan )?(sola|solo)\b/, 'estresad',
      'lloro todas las noches', 'no puedo con esto',
      'me siento culpable', 'me siento mal', 'me siento triste', 'mama soltera', 'papa soltero', 'sola con los ninos',
      'no tengo tiempo para mi', 'ya no aguanto'] },
  { eje: 'crianza_amorosa', subtema: 'emociones',
    patrones: ['miedo', 'nervios', 'ansios', 'triste', 'tristeza', 'enojo', 'rabia', 'celos', 'timid', 'inseguro',
      'insegura', 'autoestima', 'se frustra', 'frustracion', 'llora mucho', 'llora por todo', 'se enoja', 'bravo', 'brava'] },
  { eje: 'garantia_derechos', subtema: 'derechos_proteccion',
    patrones: ['derechos', 'ruta de atencion', 'proteccion', 'denunciar', 'icbf', 'comisaria', 'custodia'] },
].map((tema) => ({ ...tema, patrones: P(tema.patrones) }));

export const detectarTema = (texto) => {
  const t = normalizar(texto);
  const tema = TEMAS.find(({ patrones }) => contieneAlguno(t, patrones));
  return tema ? { eje: tema.eje, subtema: tema.subtema } : null;
};

// ─── Pedir que Edumon haga la tarea (límite: no resuelve tareas ni ejercicios) ─
const PATRONES_HACER_TAREA = P([
  'hazme la tarea', 'haz la tarea', 'hazle la tarea', 'hacerle la tarea', 'me haces la tarea', 'hagame la tarea',
  'hazme el taller', 'hazme los ejercicios', 'hazme un resumen', 'hazme una exposicion', 'hazme un ensayo',
  'resuelveme', 'resuelvelo', 'me resuelves', 'resuelve este', 'resuelve esta', 'resuelve estos', 'resuelve estas',
  'resolver este ejercicio', 'resolver esta', 'resuelvo este', 'dime la respuesta', 'dame la respuesta',
  'cual es la respuesta', 'respuesta del ejercicio', 'respuestas del taller', 'respuestas de la tarea',
  'despeja', 'escribe un ensayo', 'escribeme un', 'redactame', 'redacta un', 'traduce esto', 'traduceme',
  'cual es la capital', 'ecuacion', 'derivada', 'resume este', 'resume esta', 'resumeme', 'mapa conceptual',
  'mapa mental', 'cuadro sinoptico',
  /\bcuanto (es|da|son)\s+\d/,
  /^(por favor,? )?(resuelve|calcula|traduce|redacta)\b/,
]);
// operaciones: "125 x 8", "3 + 4", "15 - 7 =". No "2-3 horas" ni "1/2 hora".
const OPERACION = /\d+\s*[+*×÷]\s*\d+|\d+\s+x\s+\d+|\d+\s*[-/x]\s*\d+\s*=/;

export const pideHacerTarea = (texto) => {
  const t = normalizar(texto);
  return contieneAlguno(t, PATRONES_HACER_TAREA) || OPERACION.test(t);
};

// ─── Edad ─────────────────────────────────────────────────────────────────────
const NUMEROS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
};
const NUMERO = `(\\d{1,2}|${Object.keys(NUMEROS).join('|')})`;
const aNumero = (s) => (/^\d+$/.test(s) ? Number(s) : NUMEROS[s]);

// "mi hijo de 8 años", "tiene 13", "13 añitos", "de 15", "cinco años", "8 meses"
// cada patrón captura el número en el grupo "n"
const PATRONES_EDAD = [
  new RegExp(`\\b(?<n>${NUMERO})\\s*(anos|anitos|ano)\\b`),
  new RegExp(`\\btiene\\s+(?<n>${NUMERO})\\b`),
  new RegExp(`\\b(hij[oa]s?|nin[oa]s?|bebe|nene|nena|chiquit[oa]|adolescente|muchach[oa]|pelad[oa]|sobrin[oa]|niet[oa])\\s+de\\s+(?<n>${NUMERO})\\b`),
  /^\s*(?<n>\d{1,2})\s*$/,
];
const PATRON_MESES = new RegExp(`\\b(?<n>${NUMERO})\\s*mes(es)?\\b`);

export const extraerEdad = (texto) => {
  const t = normalizar(texto);
  const [conAnos, ...otros] = PATRONES_EDAD;
  // "8 meses" antes que "bebé de 8": si no dice años, los meses mandan
  const anos = t.match(conAnos);
  const meses = !anos && t.match(PATRON_MESES);
  const match = anos || (!meses && otros.map((p) => t.match(p)).find(Boolean));
  const edad = match ? aNumero(match.groups.n)
    : meses ? Math.floor(aNumero(meses.groups.n) / 12) : null;
  return edad != null && edad >= 0 && edad <= 25 ? edad : null;
};

// ─── Charla (saludos, gracias): no es una consulta ────────────────────────────
const GRACIAS = /\b(gracias|te agradezco|que amable|muy amable|me sirvio|me ayudo mucho|muy util)\b/;
const DESPEDIDA = /^(chao|chau|adios|hasta luego|hasta pronto|nos vemos|bye)\b/;
const SALUDO = /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|saludos)\b/;
const ACUSE = /^(ok|okay|vale|listo|perfecto|entiendo|entendido|de acuerdo|bueno|dale|super|genial)\b/;
// "gracias, pero no funcionó" es un seguimiento, no charla
const SEGUIMIENTO = /\b(pero|no funciona|no funciono|sigue|todavia|aun|ya lo intente|y si|que mas)\b/;

/** 'saludo' | 'gracias' | 'despedida' | 'acuse' | null */
export const detectarCharla = (texto) => {
  const t = normalizar(texto).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 8 || SEGUIMIENTO.test(t) || detectarTema(t)) return null;
  if (GRACIAS.test(t)) return 'gracias';
  if (DESPEDIDA.test(t)) return 'despedida';
  if (SALUDO.test(t)) return 'saludo';
  if (ACUSE.test(t)) return 'acuse';
  return null;
};
