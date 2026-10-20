// Constantes compartidas del módulo de IA "Edumon" (acompañante de crianza).

// subir la versión cada vez que cambie el texto del consentimiento: los padres
// que aceptaron una versión anterior deben volver a aceptarlo antes de chatear
// v2 (2026-10-06): las alertas también llegan a los docentes de los cursos de la familia
// v3 (2026-10-07): tres niveles; el aviso automático solo en casos graves
export const VERSION_CONSENTIMIENTO = '3';

// ejes temáticos de las escuelas de padres (Decreto 459 de 2024, art. 2.3.4.1.1.8)
export const EJES_CRIANZA = [
  'garantia_derechos',
  'educacion_sexualidad',
  'crianza_amorosa',
  'estilos_vida_saludable',
  'apoyo_procesos_educativos',
];

// subtemas de la biblioteca de fichas; el clasificador solo puede elegir entre estos
export const SUBTEMAS = {
  disciplina_positiva: 'Disciplina sin golpes',
  acoso_escolar: 'Acoso escolar',
  rechazo_escolar: 'No quiere ir al colegio',
  pantallas: 'Pantallas y celular',
  rabietas: 'Rabietas',
  limites: 'Límites y normas',
  tareas_estudio: 'Tareas y estudio',
  comunicacion_adolescentes: 'Comunicación con adolescentes',
  sexualidad: 'Sexualidad según la edad',
  sueno: 'Sueño',
  alimentacion: 'Alimentación',
  emociones: 'Emociones',
  autocuidado_cuidador: 'Cuidar al cuidador',
  derechos_proteccion: 'Derechos y protección',
  rutinas_organizacion: 'Rutinas y organización',
  relacion_colegio: 'Relación con el colegio',
  hermanos: 'Hermanos y celos',
  cambios_familiares: 'Separación, duelo y cambios',
  consumo_sustancias: 'Alcohol, cigarrillo y drogas',
};

// qué cubre cada subtema: el clasificador lo usa para decidir (no solo el nombre)
export const SUBTEMAS_DESCRIPCION = {
  disciplina_positiva: 'cómo corregir sin golpes ni gritos: castigos, regaños, perder la paciencia, preguntar si pegar está bien',
  acoso_escolar: 'matoneo, burlas, exclusión o golpes entre compañeros, ciberacoso; también cuando el hijo es quien molesta a otros',
  rechazo_escolar: 'no quiere ir al colegio o al jardín, llora al entrar, adaptación a un colegio o jardín nuevo',
  pantallas: 'celular, tablet, televisión, videojuegos, redes sociales, tiempo de pantalla',
  rabietas: 'pataletas, berrinches y explosiones de rabia (de pequeños y de escolares)',
  limites: 'no hace caso, desobedece, contesta mal, groserías, mentiras, agresividad, normas y permisos',
  tareas_estudio: 'acompañar las tareas, hábitos de estudio, bajas notas, concentración, motivación por estudiar',
  comunicacion_adolescentes: 'adolescente que no habla, se encierra, privacidad, confianza, rebeldía',
  sexualidad: 'cuerpo, pubertad, menstruación, preguntas sobre sexo, noviazgo, consentimiento, contenido sexual en internet, orientación e identidad',
  sueno: 'dormir, acostarse, pesadillas, despertares, horarios de sueño, moja la cama',
  alimentacion: 'no come, come mal, dulces, lonchera, onces, comer en familia, peso',
  emociones: 'miedos, ansiedad, tristeza, enojo, timidez, autoestima, frustración del niño',
  autocuidado_cuidador: 'cansancio, estrés, culpa o soledad del cuidador; criar sin apoyo',
  derechos_proteccion: 'derechos de los niños, rutas de protección, ICBF, comisaría de familia, denunciar',
  rutinas_organizacion: 'mañanas antes del colegio, horarios, organizar la maleta y los útiles, olvidos, hábitos diarios en casa',
  relacion_colegio: 'cómo hablar con el docente o el colegio, citaciones, reuniones, quejas, anotaciones en el observador',
  hermanos: 'peleas entre hermanos, celos, la llegada de un hermanito, comparaciones',
  cambios_familiares: 'separación o divorcio, muerte de un ser querido y duelo, mudanza, cambio de colegio, migración, nueva pareja',
  consumo_sustancias: 'alcohol, cigarrillo, vapeador, marihuana u otras drogas en niños y adolescentes',
};

export const EJES_LABELS = {
  garantia_derechos: 'Garantía de derechos',
  educacion_sexualidad: 'Educación de la sexualidad',
  crianza_amorosa: 'Crianza amorosa y respetuosa',
  estilos_vida_saludable: 'Estilos de vida saludables',
  apoyo_procesos_educativos: 'Apoyo en procesos educativos',
};

// qué subtemas caben en cada eje (los mismos que usan las fichas)
export const SUBTEMAS_POR_EJE = {
  garantia_derechos: ['acoso_escolar', 'derechos_proteccion'],
  educacion_sexualidad: ['sexualidad'],
  crianza_amorosa: ['disciplina_positiva', 'rabietas', 'limites', 'comunicacion_adolescentes', 'emociones', 'autocuidado_cuidador', 'hermanos', 'cambios_familiares'],
  estilos_vida_saludable: ['pantallas', 'sueno', 'alimentacion', 'consumo_sustancias'],
  apoyo_procesos_educativos: ['tareas_estudio', 'rechazo_escolar', 'rutinas_organizacion', 'relacion_colegio'],
};

// riesgo_moderado: se ofrece ayuda y solo se avisa si la familia la pide; riesgo: aviso automático
export const NIVELES_RIESGO = ['normal', 'atencion', 'riesgo_moderado', 'riesgo'];

export const CATEGORIAS_RIESGO = [
  'maltrato_fisico',
  'maltrato_psicologico',
  'abuso_sexual',
  'violencia_intrafamiliar',
  'autolesion_suicidio',
  'negligencia_grave',
];

// las conversaciones se borran solas tras 30 días sin actividad (TTL de Mongo)
export const DIAS_RETENCION_CONVERSACIONES = 30;
