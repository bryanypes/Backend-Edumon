import { normalizar } from './reglas.js';
import {
  FUENTES, DECRETO_1965_ART_40, DECRETO_1965_ART_41_PARAGRAFO, DECRETO_1965_ART_41_NUM_7,
  DECRETO_1965_PROTOCOLOS, DECRETO_1965_ART_44_NUM_3, LEY_1098_ART_44, PENDIENTES,
} from '../../config/normasRutaAtencion.js';

// Clasificación de ruta de una situación de riesgo.
//
// PENDIENTE DE VALIDACIÓN POR ORIENTACIÓN/CONVIVENCIA. Es una propuesta para
// orientar al colegio, no una calificación jurídica: la tipificación la hace
// el Comité Escolar de Convivencia. Criterio (todo deterministico y auditable):
//
// 1. ámbito
//    - "personal": riesgo de autolesión o suicidio (la persona en riesgo es el
//      propio niño o el cuidador, dondequiera que ocurra).
//    - "escolar": quien agrede es un miembro de la comunidad educativa o el
//      hecho ocurre en el colegio (Decreto 1965 de 2013, art. 41, parágrafo).
//    - "hogar": todo lo demás (Edumon habla con familias: lo que cuentan pasa
//      en casa o en su entorno).
// 2. tipoLey1620 (solo ámbito escolar; Decreto 1965 de 2013, art. 40)
//    - III: abuso sexual (presunto delito contra la libertad, integridad y
//      formación sexual) o caso grave (lesiones, amenazas con armas: presunto
//      delito según la ley penal).
//    - II: caso moderado repetido o sistemático, o con daño al cuerpo.
//    - I: caso moderado esporádico, sin daño al cuerpo.
// 3. protocolo
//    - escolar: el del tipo (Decreto 1965 de 2013, arts. 42, 43 y 44).
//    - hogar: Ley 1098 de 2006, art. 44 — num. 9 (reportar a las autoridades
//      competentes) si es grave o abuso sexual; num. 2 (detección, apoyo y
//      orientación) si es moderado. Las entidades se toman del directorio del
//      Decreto 1965 de 2013, art. 41, num. 7.
//    - personal: protocolo de salud mental — PENDIENTE de fuente oficial.

const PENDIENTE = 'Pendiente de validación por orientación/convivencia';

const ACTOR_ESCOLAR = /\b(profe|profes|profesor|profesora|profesores|docente|docentes|maestr[oa]s?|coordinador[a]?|rector[a]?|orientador[a]?|celador|vigilante del colegio|companer[oa]s?|otro nino|otra nina|otros ninos|otras ninas|un nino del|una nina del|estudiantes? de)\b/;
const LUGAR_ESCOLAR = /\b(en el colegio|en la escuela|en el salon|en el recreo|en clase|en el bus del colegio|en la ruta|en el jardin infantil)\b/;
const REPETIDO = /\b(siempre|todos los dias|cada (dia|semana|vez)|otra vez|de nuevo|todo el tiempo|varias veces|no es la primera vez|sigue|siguen|desde hace)\b/;
const DANO = /\b(sangr\w*|moreton\w*|morad[oa]s?|marcas|herid\w*|golpe\w*|lesion\w*|hinchad\w*)\b/;

const cita = (fuente, articulo, texto) => ({ norma: FUENTES[fuente].norma, articulo, fuente: FUENTES[fuente].url, texto });

export const detectarAmbito = (categoria, texto = '') => {
  if (categoria === 'autolesion_suicidio') return 'personal';
  const t = normalizar(texto);
  return ACTOR_ESCOLAR.test(t) || LUGAR_ESCOLAR.test(t) ? 'escolar' : 'hogar';
};

function rutaEscolar(categoria, gravedad, t) {
  let tipo;
  let criterio;
  if (categoria === 'abuso_sexual') {
    tipo = 'III';
    criterio = 'Ámbito escolar con contenido sexual: presunto delito contra la libertad, integridad y formación sexual.';
  } else if (gravedad === 'grave') {
    tipo = 'III';
    criterio = 'Ámbito escolar con lesiones o amenazas graves: posible delito según la ley penal.';
  } else if (REPETIDO.test(t) || DANO.test(t)) {
    tipo = 'II';
    criterio = REPETIDO.test(t)
      ? 'Ámbito escolar, situación que se repite (de manera repetida o sistemática).'
      : 'Ámbito escolar, con daño al cuerpo o a la salud (no se sabe si hay incapacidad).';
  } else {
    tipo = 'I';
    criterio = 'Ámbito escolar, situación esporádica sin daño al cuerpo o a la salud.';
  }
  return {
    ambito: 'escolar',
    tipoLey1620: tipo,
    protocolo: tipo === 'III'
      ? `${DECRETO_1965_PROTOCOLOS.III} El Comité Escolar de Convivencia pone la situación en conocimiento de la Policía Nacional (num. 3).`
      : DECRETO_1965_PROTOCOLOS[tipo],
    criterio,
    fundamento: [
      cita('decreto1965', 'Art. 41, parágrafo', DECRETO_1965_ART_41_PARAGRAFO),
      cita('decreto1965', `Art. 40, num. ${{ I: 1, II: 2, III: 3 }[tipo]}`, DECRETO_1965_ART_40[tipo]),
      ...(tipo === 'III' ? [cita('decreto1965', 'Art. 44, num. 3', DECRETO_1965_ART_44_NUM_3)] : []),
    ],
  };
}

function rutaHogar(categoria, gravedad) {
  const reportar = gravedad === 'grave' || categoria === 'abuso_sexual';
  return {
    ambito: 'hogar',
    tipoLey1620: null,
    protocolo: reportar
      ? 'Reporte a las autoridades competentes (ICBF, Comisaría o Defensoría de Familia, Policía de Infancia y Adolescencia) por presunto delito o vulneración de derechos.'
      : 'Detección oportuna, apoyo y orientación a la familia; valorar el reporte a las autoridades competentes si la situación persiste.',
    criterio: reportar
      ? 'Situación grave en el hogar (o de contenido sexual): obligación de reportar.'
      : 'Situación moderada en el hogar: apoyo y orientación.',
    fundamento: [
      cita('ley1098', reportar ? 'Art. 44, num. 9' : 'Art. 44, num. 2', reportar ? LEY_1098_ART_44.num9 : LEY_1098_ART_44.num2),
      ...(reportar ? [cita('ley1098', 'Art. 44, num. 2', LEY_1098_ART_44.num2)] : []),
      cita('decreto1965', 'Art. 41, num. 7 (directorio de entidades)', DECRETO_1965_ART_41_NUM_7),
    ],
  };
}

const rutaPersonal = () => ({
  ambito: 'personal',
  tipoLey1620: null,
  protocolo: 'Protocolo de salud mental de la ruta de atención (riesgo suicida): PENDIENTE de fuente oficial.',
  criterio: 'Riesgo de autolesión o suicidio: requiere atención inmediata en salud mental.',
  fundamento: [],
  fuentePendiente: PENDIENTES.protocoloRiesgoSuicida,
});

/**
 * @param {{ categoria: string, gravedad: 'grave'|'moderado', texto: string }} situacion
 * @returns {{ ambito, tipoLey1620, protocolo, criterio, fundamento, pendienteValidacion, nota, fuentePendiente? }}
 */
export function clasificarRuta({ categoria, gravedad, texto }) {
  if (!categoria) return null;
  const ambito = detectarAmbito(categoria, texto);
  const ruta = ambito === 'personal' ? rutaPersonal()
    : ambito === 'escolar' ? rutaEscolar(categoria, gravedad, normalizar(texto))
      : rutaHogar(categoria, gravedad);
  return { ...ruta, fuentePendiente: ruta.fuentePendiente ?? null, pendienteValidacion: true, nota: PENDIENTE };
}
