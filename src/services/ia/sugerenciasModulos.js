import { completarJSON, iaDisponible } from './groqClient.js';
import { EJES_CRIANZA, EJES_LABELS } from '../../config/edumonIA.js';
import { normalizar } from './reglas.js';

// Catálogo base de módulos de escuela de padres (un módulo agrupa varios retos
// del mismo tema). Sirve de respaldo sin IA y de inspiración para la IA.
export const MODULOS_BASE = [
  { titulo: 'Crianza respetuosa', eje: 'crianza_amorosa', descripcion: 'Retos para acompañar a los hijos con afecto, límites claros y sin golpes ni gritos.', ideasRetos: ['Elogiar el esfuerzo durante una semana', 'Pausa para calmarse antes de corregir', 'Acordar las reglas de la casa en familia'] },
  { titulo: 'Alimentación saludable', eje: 'estilos_vida_saludable', descripcion: 'Retos para crear hábitos de alimentación en familia, sin peleas a la hora de comer.', ideasRetos: ['Lonchera saludable preparada juntos', 'Comida en familia sin pantallas', 'Probar un alimento nuevo sin presión'] },
  { titulo: 'Uso responsable de pantallas', eje: 'estilos_vida_saludable', descripcion: 'Retos para acordar tiempos de pantalla y cuidar la seguridad en internet.', ideasRetos: ['Hora del día sin pantallas', 'Celular fuera del cuarto en la noche', 'Conocer el juego favorito de mi hijo'] },
  { titulo: 'Emociones en familia', eje: 'crianza_amorosa', descripcion: 'Retos para reconocer, nombrar y acompañar las emociones de hijos y adultos.', ideasRetos: ['Diario de emociones de la semana', 'Rincón de la calma en casa', 'Reparar después de un mal momento'] },
  { titulo: 'Acompañamiento escolar en casa', eje: 'apoyo_procesos_educativos', descripcion: 'Retos para apoyar el estudio sin hacer las tareas por ellos.', ideasRetos: ['Rutina y lugar fijo para las tareas', 'Preguntar qué aprendió hoy', 'Celebrar el esfuerzo más que la nota'] },
  { titulo: 'Sueño y rutinas', eje: 'estilos_vida_saludable', descripcion: 'Retos para mejorar el descanso y las rutinas de la mañana y la noche.', ideasRetos: ['Rutina de 3 pasos antes de dormir', 'Mañanas sin afanes', 'Apagar pantallas una hora antes de dormir'] },
  { titulo: 'Educación de la sexualidad', eje: 'educacion_sexualidad', descripcion: 'Retos para hablar del cuerpo, el cuidado y el respeto según la edad.', ideasRetos: ['Secretos buenos y secretos malos', 'Nombrar las partes del cuerpo', 'Hablar de respeto en las relaciones'] },
  { titulo: 'Convivencia y prevención del acoso', eje: 'garantia_derechos', descripcion: 'Retos para prevenir el matoneo y saber cómo actuar si pasa.', ideasRetos: ['A quién acudir si alguien me trata mal', 'Ponerse en los zapatos del otro', 'Uso seguro de las redes'] },
  { titulo: 'Derechos y protección', eje: 'garantia_derechos', descripcion: 'Retos para conocer los derechos de los niños y las rutas de protección.', ideasRetos: ['Nuestros derechos en familia', 'Mapa de adultos de confianza', 'Líneas de ayuda en la nevera'] },
  { titulo: 'Cuidar al cuidador', eje: 'crianza_amorosa', descripcion: 'Retos para que madres, padres y cuidadores también se cuiden.', ideasRetos: ['5 minutos solo para mí', 'Pedir ayuda a la red de apoyo', 'Respirar antes de reaccionar'] },
];

const SYSTEM_MODULOS = `Ayudas a docentes de colegios colombianos a organizar la escuela de padres (Ley 2025 de 2020, Decreto 459 de 2024). En la plataforma Edumon, un curso es un grado (Transición, Primero… Undécimo) y un módulo es un tema de escuela de padres que agrupa varios retos que las familias hacen en casa (por ejemplo "Crianza respetuosa" o "Alimentación saludable").

Propón 4 módulos nuevos para el curso de <curso>:
- No repitas ni parafrasees los módulos que ya existen en <modulos_existentes>.
- Adáptalos a la edad del grado y al <contexto> si viene.
- Cubre ejes distintos del Decreto 459 cuando sea posible. Puedes inspirarte en <catalogo>, pero también proponer temas nuevos.
- "titulo": corto (máximo 5 palabras). "descripcion": una frase para las familias. "ideasRetos": 3 ideas de retos cortos (máximo 8 palabras cada una).
- Español colombiano sencillo. Sin markdown.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['modulos'],
  properties: {
    modulos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'descripcion', 'eje', 'ideasRetos'],
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          eje: { type: 'string', enum: EJES_CRIANZA },
          ideasRetos: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const conEjeLabel = (m) => ({ ...m, ejeLabel: EJES_LABELS[m.eje] });

// del catálogo, los que el curso todavía no tiene
const sugerenciasDelCatalogo = (existentes) => {
  const usados = new Set(existentes.map(normalizar));
  return MODULOS_BASE.filter((m) => !usados.has(normalizar(m.titulo))).slice(0, 4);
};

/**
 * Sugiere módulos de escuela de padres para un curso (grado), sin repetir los existentes.
 */
export async function sugerirModulos({ curso, existentes = [], contexto }) {
  if (!iaDisponible()) {
    return { modulos: sugerenciasDelCatalogo(existentes).map(conEjeLabel), generadoPor: 'catalogo' };
  }

  try {
    const r = await completarJSON({
      system: SYSTEM_MODULOS,
      messages: [{
        role: 'user',
        content: [
          `<curso>${curso}</curso>`,
          `<modulos_existentes>${existentes.join(' | ') || '(ninguno)'}</modulos_existentes>`,
          contexto ? `<contexto>${contexto}</contexto>` : '',
          `<catalogo>${MODULOS_BASE.map((m) => m.titulo).join(' | ')}</catalogo>`,
        ].filter(Boolean).join('\n'),
      }],
      schema: SCHEMA,
      nombre: 'sugerencias_modulos',
      esfuerzo: 'low',
    });

    const usados = new Set(existentes.map(normalizar));
    const modulos = r.modulos
      .filter((m) => !usados.has(normalizar(m.titulo)))
      .slice(0, 4)
      .map((m) => conEjeLabel({ ...m, titulo: m.titulo.slice(0, 200), ideasRetos: m.ideasRetos.slice(0, 3) }));
    return { modulos, generadoPor: 'ia' };
  } catch (error) {
    console.error('[Edumon] Sugerencias de módulos IA falló, uso el catálogo:', error.message);
    return { modulos: sugerenciasDelCatalogo(existentes).map(conEjeLabel), generadoPor: 'catalogo' };
  }
}
