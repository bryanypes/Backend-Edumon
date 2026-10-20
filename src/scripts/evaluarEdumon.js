/**
 * Mide al clasificador de Edumon (LLM + reglas) contra el set de evaluación.
 * Necesita GROQ_API_KEY en el .env; sin ella mide solo las reglas.
 *
 *   npm run eval:edumon
 *   npm run eval:edumon -- --solo-fallos
 */
import 'dotenv/config';
import { clasificar } from '../services/ia/clasificador.js';
import { iaDisponible, modelo } from '../services/ia/groqClient.js';
import { CASOS_EVALUACION } from '../data/casosEvaluacionEdumon.js';

// el plan gratuito de Groq admite 8000 tokens por minuto y cada clasificación
// usa ~2600: con menos pausa las llamadas caen a las reglas y la medición no vale
const PAUSA_MS = iaDisponible() ? Number(process.env.EVAL_PAUSA_MS) || 21000 : 0;
const soloFallos = process.argv.includes('--solo-fallos');
const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

const metricas = {
  riesgo: { ok: 0, total: 0 },
  tema: { ok: 0, total: 0 },
  tarea: { ok: 0, total: 0 },
  edad: { ok: 0, total: 0 },
};
// los errores que más importan: alertar de más o dejar pasar un caso grave
const falsosGraves = [];
const gravesPerdidos = [];
const sinLLM = [];

console.log(`🧪 Evaluando ${CASOS_EVALUACION.length} casos con ${iaDisponible() ? `LLM (${modelo()}) + reglas` : 'solo reglas (sin GROQ_API_KEY ni OPENAI_API_KEY)'}\n`);

for (const caso of CASOS_EVALUACION) {
  const r = await clasificar(caso.texto, []);
  const riesgo = r.categoriaRiesgo ? `${r.categoriaRiesgo}:${r.gravedad}` : null;
  const fallos = [];

  // sin LLM, un caso dudoso se espera sin riesgo (queda en atención)
  const riesgoEsperado = !iaDisponible() && caso.dudoso ? null : caso.riesgo;
  metricas.riesgo.total += 1;
  if (riesgo === riesgoEsperado) metricas.riesgo.ok += 1;
  else fallos.push(`riesgo: esperado ${riesgoEsperado}, obtuvo ${riesgo}`);
  if (riesgo?.endsWith(':grave') && !riesgoEsperado?.endsWith(':grave')) falsosGraves.push(caso.texto);
  if (riesgoEsperado?.endsWith(':grave') && !riesgo?.endsWith(':grave')) gravesPerdidos.push(caso.texto);

  if (caso.subtema !== undefined && (iaDisponible() || !caso.soloLLM)) {
    metricas.tema.total += 1;
    const subtema = r.tema?.subtema ?? null;
    if ([caso.subtema].flat().includes(subtema)) metricas.tema.ok += 1;
    else fallos.push(`tema: esperado ${caso.subtema}, obtuvo ${subtema}`);
  }
  if (caso.tarea !== undefined) {
    metricas.tarea.total += 1;
    if (Boolean(r.pideHacerTarea) === caso.tarea) metricas.tarea.ok += 1;
    else fallos.push(`tarea: esperado ${caso.tarea}, obtuvo ${r.pideHacerTarea}`);
  }
  if (caso.edad !== undefined) {
    metricas.edad.total += 1;
    if (r.edad === caso.edad) metricas.edad.ok += 1;
    else fallos.push(`edad: esperado ${caso.edad}, obtuvo ${r.edad}`);
  }

  if (iaDisponible() && r.fuente !== 'ia') sinLLM.push(caso.texto);
  // sin cuota diaria, todo lo que sigue lo responderían las reglas: la medición ya no vale
  if (/cuota diaria/.test(r.deteccion?.errorIA ?? '')) {
    console.log(`\n⛔ Se agotó la cuota diaria de Groq tras ${metricas.riesgo.total} casos. Vuelve a correr la evaluación mañana.`);
    break;
  }
  if (fallos.length) console.log(`❌ "${caso.texto}"${r.fuente !== 'ia' && iaDisponible() ? ' (el LLM falló, respondieron las reglas)' : ''}\n   ${fallos.join('\n   ')}`);
  else if (!soloFallos) console.log(`✅ "${caso.texto}"`);
  await esperar(PAUSA_MS);
}

const pct = ({ ok, total }) => (total ? `${ok}/${total} (${Math.round((ok / total) * 100)}%)` : '—');
console.log('\n📊 Resultados');
console.log(`   Riesgo: ${pct(metricas.riesgo)}`);
console.log(`   Tema:   ${pct(metricas.tema)}`);
console.log(`   Tareas: ${pct(metricas.tarea)}`);
console.log(`   Edad:   ${pct(metricas.edad)}`);
console.log(`\n🚨 Alertas graves de más (avisarían sin motivo): ${falsosGraves.length}`);
falsosGraves.forEach((t) => console.log(`   - ${t}`));
console.log(`🚨 Casos graves que no alertaron: ${gravesPerdidos.length}`);
gravesPerdidos.forEach((t) => console.log(`   - ${t}`));
if (sinLLM.length) console.log(`\n⚠️  ${sinLLM.length} casos los respondieron las reglas porque el LLM falló (límite de Groq): sube EVAL_PAUSA_MS`);
