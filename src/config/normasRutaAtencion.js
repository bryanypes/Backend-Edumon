// Textos normativos que sustentan la clasificación de ruta de las alertas.
//
// PENDIENTE DE VALIDACIÓN POR ORIENTACIÓN/CONVIVENCIA: la transcripción es
// literal, pero la forma en que Edumon los APLICA (services/ia/rutaAtencion.js)
// es una propuesta técnica que el comité escolar de convivencia debe validar.
//
// Fuente: Gestor Normativo de Función Pública, descargado el 2026-10-20.
// No se transcribió nada de memoria: lo que no se pudo descargar queda en
// PENDIENTES.

export const FUENTES = {
  decreto1965: {
    norma: 'Decreto 1965 de 2013',
    url: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=54537',
  },
  ley1098: {
    norma: 'Ley 1098 de 2006 (Código de la Infancia y la Adolescencia)',
    url: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=22106',
  },
  ley1620: {
    norma: 'Ley 1620 de 2013',
    url: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=52287',
  },
};

// Decreto 1965 de 2013, artículo 40 (texto literal)
export const DECRETO_1965_ART_40 = {
  encabezado: 'Artículo 40. Clasificación de las situaciones. Las situaciones que afectan la convivencia escolar y el ejercicio de los derechos humanos, sexuales y reproductivos, se clasifican en tres tipos:',
  I: '1. Situaciones Tipo I. Corresponden a este tipo los conflictos manejados inadecuadamente y aquellas situaciones esporádicas que inciden negativamente en el clima escolar, y que en ningún caso generan daños al cuerpo o a la salud.',
  II: '2. Situaciones Tipo II. Corresponden a este tipo las situaciones de agresión escolar, acoso escolar (bullying) y ciberacoso (Ciberbullying), que no revistan las características de la comisión de un delito y que cumplan con cualquiera de las siguientes características: a) Que se presenten de manera repetida o sistemática; b) Que causen daños al cuerpo o a la salud sin generar incapacidad alguna para cualquiera de los involucrados.',
  III: '3. Situaciones Tipo III. Corresponden a este tipo las situaciones de agresión escolar que sean constitutivas de presuntos delitos contra la libertad, integridad y formación sexual, referidos en el Título IV del Libro II de la Ley 599 de 2000, o cuando constituyen cualquier otro delito establecido en la ley penal colombiana vigente.',
};

// Decreto 1965 de 2013, artículo 41, parágrafo (ámbito de los protocolos escolares)
export const DECRETO_1965_ART_41_PARAGRAFO = 'Parágrafo. La aplicación de los protocolos tendrá lugar frente a las situaciones que se presenten de estudiantes hacia otros miembros de la comunidad educativa, o de otros miembros de la comunidad educativa hacia estudiantes.';

// Decreto 1965 de 2013, artículo 41, numeral 7 (directorio de entidades)
export const DECRETO_1965_ART_41_NUM_7 = '7. Un directorio que contenga los números telefónicos actualizados de las siguientes entidades y personas: Policía Nacional, del responsable de seguridad de la Secretaría de Gobierno Municipal, Distrital o Departamental, Fiscalía General de la Nación Unidad de Infancia y Adolescencia, Policía de Infancia y Adolescencia, Defensoría de Familia, Comisaría de Familia, Inspector de Policía, ICBF - Instituto Colombiano de Bienestar Familiar, del puesto de salud u Hospital más cercano, Bomberos, Cruz Roja, Defensa Civil, Medicina Legal, de las entidades que integran el Sistema Nacional de Convivencia Escolar, de los padres de familia o acudientes de los niños, niñas y adolescentes matriculados en el establecimiento educativo.';

// Decreto 1965 de 2013, artículos 42, 43 y 44: títulos (los procedimientos completos están en la fuente)
export const DECRETO_1965_PROTOCOLOS = {
  I: 'Artículo 42. De los protocolos para la atención de Situaciones Tipo I.',
  II: 'Artículo 43. De los protocolos para la atención de Situaciones Tipo II.',
  III: 'Artículo 44. Protocolo para la atención de Situaciones Tipo III.',
};
export const DECRETO_1965_ART_44_NUM_3 = '3. El Presidente del Comité Escolar de Convivencia de manera inmediata y por el medio más expedito, pondrá la situación en conocimiento de la Policía Nacional, actuación de la cual se dejará constancia.';

// Ley 1098 de 2006, artículo 44 (numerales que aplican a las alertas del hogar)
export const LEY_1098_ART_44 = {
  encabezado: 'Artículo 44. Obligaciones complementarias de las instituciones educativas. Los directivos y docentes de los establecimientos académicos y la comunidad educativa en general pondrán en marcha mecanismos para:',
  num2: '2. Establecer la detección oportuna y el apoyo y la orientación en casos de malnutrición, maltrato, abandono, abuso sexual, violencia intrafamiliar, y explotación económica y laboral, las formas contemporáneas de servidumbre y esclavitud, incluidas las peores formas de trabajo infantil.',
  num9: '9. Reportar a las autoridades competentes, las situaciones de abuso, maltrato o peores formas de trabajo infantil detectadas en niños, niñas y adolescentes.',
};

// Lo que no se encontró en una fuente oficial descargable: NO se reconstruye de memoria.
export const PENDIENTES = {
  protocoloRiesgoSuicida: 'No se encontró en Función Pública ni en MinEducación un texto normativo descargable con el protocolo de atención a riesgo suicida en establecimientos educativos. La Ley 1620 de 2013, art. 33 (atención en salud mental), se refiere a familias afectadas por violencia escolar o vulneración de derechos sexuales y reproductivos, no a la ideación suicida. Pendiente: que orientación escolar aporte el protocolo vigente (institucional o de la secretaría de salud).',
};
