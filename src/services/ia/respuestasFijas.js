// Textos fijos que NUNCA escribe la IA. Revisar con orientación escolar antes
// de la demo y verificar que las líneas de ayuda sigan vigentes.

const LINEAS_AYUDA = [
  '📞 ICBF: línea 141 (gratuita, 24 horas) — protección de niños, niñas y adolescentes.',
  '📞 Línea 155: orientación a mujeres víctimas de violencia.',
  '📞 Línea 192, opción 4: apoyo en salud mental.',
  '🚨 Si hay peligro inmediato, llama al 123.',
].join('\n');

const INTRO_POR_CATEGORIA = {
  autolesion_suicidio: 'Gracias por contármelo. Lo que describes es muy importante y no tienes que manejarlo sola o solo.',
  abuso_sexual: 'Gracias por confiar en mí. Lo que cuentas es grave y lo más importante ahora es la protección de tu hijo o hija.',
  maltrato_fisico: 'Gracias por contarlo con honestidad. Golpear a un niño, aunque sea para corregirlo, le hace daño y en Colombia está prohibido (Ley 2089 de 2021). Pedir ayuda para criar de otra forma es un paso valiente, y hay personas que pueden acompañarte.',
  violencia_intrafamiliar: 'Gracias por contarlo. Nadie merece vivir con violencia en su casa, y hay personas que pueden ayudarte ahora mismo.',
  maltrato_psicologico: 'Gracias por contarlo. Reconocerlo es un primer paso valiente, y hay personas que pueden acompañarte para manejarlo de otra forma.',
  negligencia_grave: 'Gracias por contarlo. Lo que describes necesita apoyo pronto, y no tienes que resolverlo sola o solo.',
};

export const respuestaRiesgo = (categoria) => [
  INTRO_POR_CATEGORIA[categoria] || 'Gracias por contarlo. Lo que describes necesita apoyo de personas especializadas.',
  '',
  'En esta situación no voy a darte consejos: lo mejor es que hables ya con quien puede ayudarte de verdad.',
  '',
  LINEAS_AYUDA,
  '',
  'Como aceptaste en el consentimiento informado, voy a avisar al responsable de convivencia de tu colegio y a los docentes de tus cursos para que te acompañen. No verán tu conversación: solo el tipo de situación y el mensaje que la originó.',
].join('\n');

// nivel 2: apoyo sin aviso; la familia decide si quiere que la contacten
const APOYO_POR_CATEGORIA = {
  violencia_intrafamiliar: 'Gracias por contármelo. Nadie merece vivir con violencia en su casa, y lo que sientes es importante.',
  maltrato_psicologico: 'Gracias por contármelo con honestidad. Reconocer lo que pasa ya es un paso grande para cambiarlo.',
  maltrato_fisico: 'Gracias por contármelo con honestidad. Criar sin golpes es posible, y pedir ayuda para lograrlo es un paso valiente.',
  negligencia_grave: 'Gracias por contármelo. Pasar por momentos difíciles para cubrir lo básico no te hace mal cuidador, y no tienes que resolverlo sola o solo: el colegio y el ICBF (línea 141) pueden orientarte sobre apoyos disponibles.',
};

const CIERRE_APOYO = {
  negligencia_grave: 'Si en algún momento un niño queda en peligro, llama al 123.',
};

export const respuestaApoyo = (categoria) => [
  APOYO_POR_CATEGORIA[categoria] || 'Gracias por contármelo. Lo que vives es importante.',
  '',
  'Esta conversación es privada. Si quieres, orientación escolar y tu docente pueden acompañarte: solo les avisaré si tú me lo pides.',
  CIERRE_APOYO[categoria] || 'Si en algún momento hay peligro, llama al 123; y la línea 155 orienta a mujeres que viven violencia.',
].join('\n');

// nivel 2 con tema de crianza: se agrega al final de la respuesta normal
const ACOMPANAR_EN = {
  maltrato_fisico: 'a criar sin golpes',
  maltrato_psicologico: 'a manejar estos momentos de otra forma',
  negligencia_grave: 'con lo que estás viviendo',
};

export const notaOfrecerAyuda = (categoria) => `Lo que me cuentas es importante. Si quieres, orientación escolar y tu docente pueden acompañarte ${ACOMPANAR_EN[categoria] || 'en esto'}: solo les avisaré si tú me lo pides.`;

// charla: saludos, agradecimientos y despedidas no son consultas
const RESPUESTAS_CHARLA = {
  saludo: '¡Hola! 💙 Cuéntame qué está pasando con tu hijo o hija, o qué te gustaría mejorar en casa. Si me dices su edad, te doy ideas pensadas para su etapa.',
  gracias: '¡Con mucho gusto! 💙 Recuerda que los cambios toman tiempo: prueba la práctica unos días y me cuentas cómo te fue. Aquí estoy si quieres seguir hablando.',
  despedida: '¡Hasta pronto! 💙 Cuando quieras, aquí estoy para acompañarte.',
  acuse: 'Perfecto. 💙 Si quieres, cuéntame cómo te va con lo que hablamos o pregúntame lo que necesites.',
};

export const respuestaCharla = (tipo) => RESPUESTAS_CHARLA[tipo] || RESPUESTAS_CHARLA.saludo;

export const RESPUESTA_AYUDA_SOLICITADA = 'Listo. Avisé a orientación escolar y a tu docente que quieres apoyo; te van a contactar pronto. No verán tu conversación: solo el tipo de situación y el mensaje que me escribiste sobre esto. Mientras tanto, aquí sigo para lo que necesites. 💙';

export const RESPUESTA_PEDIR_EDAD = '¿Qué edad tiene tu hijo o hija? Así te doy ideas que funcionen para su etapa.';

export const RESPUESTA_FUERA_DE_ALCANCE = [
  'Todavía no tengo información confiable sobre eso, y prefiero no inventarte una respuesta.',
  'Te sugiero hablarlo con orientación escolar de tu colegio.',
  '',
  'Puedo acompañarte en la crianza y en la vida escolar de tus hijos: emociones, conducta y límites, pantallas, sueño y alimentación, rutinas y organización, cómo acompañar el estudio, cuando no quiere ir al colegio, convivencia y acoso escolar, peleas entre hermanos, separación o duelo, sexualidad según la edad, alcohol y drogas, la relación con el colegio y cómo cuidarte tú.',
].join('\n');

export const RESPUESTA_NO_HAGO_TAREAS = [
  'Eso no lo puedo hacer: no resuelvo tareas, ejercicios ni trabajos del colegio. 😊',
  'Lo que sí puedo es ayudarte a acompañar a tu hijo o hija para que los haga por su cuenta: una rutina de estudio, cómo motivarlo, qué hacer si se frustra o si no entiende el tema, y cuándo hablar con el docente.',
  '',
  '¿Quieres que te cuente cómo acompañarlo con esa tarea sin hacérsela?',
].join('\n');

export const NOTA_ATENCION = 'Si sientes que esto te supera, no estás sola o solo: orientación escolar de tu colegio puede acompañarte, y la línea 192 opción 4 ofrece apoyo emocional.';
