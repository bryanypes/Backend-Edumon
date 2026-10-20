/**
 * Mide al clasificador de Edumon (LLM + reglas) contra los conjuntos de evaluación.
 * Sin GROQ_API_KEY ni OPENAI_API_KEY mide solo las reglas (modo simulado).
 *
 *   npm run eval:edumon                          # conjunto original (193) y holdout
 *   npm run eval:edumon -- --conjunto=holdout    # original | holdout | todos
 *   npm run eval:edumon -- --solo-fallos
 *
 * El número que importa es el del holdout (tests/ia/holdout): las reglas nunca
 * se ajustaron mirando esos casos.
 */
import 'dotenv/config';
import { iaDisponible, modeloPrincipal as modelo } from '../services/ia/proveedorIA.js';
import { evaluarConjunto } from '../services/ia/evaluacion.js';
import { CASOS_EVALUACION } from '../data/casosEvaluacionEdumon.js';
import { CASOS_HOLDOUT } from '../../tests/ia/holdout/casosHoldout.js';

const arg = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
const soloFallos = process.argv.includes('--solo-fallos');
const conjunto = arg('conjunto') || 'todos';
const conLLM = iaDisponible();
// el plan gratuito de Groq admite 8000 tokens por minuto y cada clasificación
// usa ~2600: con menos pausa las llamadas caen a las reglas y la medición no vale
const pausaMs = conLLM ? Number(process.env.EVAL_PAUSA_MS) || 21000 : 0;

const CONJUNTOS = {
  original: { nombre: 'Original (193)', casos: CASOS_EVALUACION, compatDudosos: true },
  holdout: { nombre: 'Holdout (nuevo)', casos: CASOS_HOLDOUT, compatDudosos: false },
};
const elegidos = conjunto === 'todos' ? ['original', 'holdout'] : [conjunto];
if (!elegidos.every((c) => CONJUNTOS[c])) {
  console.error(`Conjunto desconocido: ${conjunto}. Usa original, holdout o todos.`);
  process.exit(1);
}

const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
console.log(`🧪 Modo: ${conLLM ? `LLM (${modelo()}) + reglas` : 'simulado: solo reglas (sin llaves de IA)'}`);

for (const clave of elegidos) {
  const { nombre, casos, compatDudosos } = CONJUNTOS[clave];
  console.log(`\n━━━ ${nombre}: ${casos.length} casos ━━━`);
  const m = await evaluarConjunto(casos, {
    conLLM,
    compatDudosos,
    pausaMs,
    alCaso: (caso, r, motivos) => {
      if (motivos.length) console.log(`❌ "${caso.texto}"${conLLM && r.fuente !== 'ia' ? ' (respondieron las reglas)' : ''}\n   ${motivos.join('\n   ')}`);
      else if (!soloFallos) console.log(`✅ "${caso.texto}"`);
    },
  });

  console.log(`\n📊 ${nombre}`);
  console.log(`   Recall de graves:        ${pct(m.recallGraves)} (${m.conteos.graves.detectados}/${m.conteos.graves.esperados}; categoría correcta ${pct(m.gravesCategoriaCorrecta)})`);
  console.log(`   Tasa de falsas alarmas:  ${pct(m.tasaFalsasAlarmas)} (${m.conteos.noGraves.falsasAlarmas}/${m.conteos.noGraves.total} casos no graves)`);
  console.log(`   Riesgo exacto:           ${pct(m.riesgoExacto)}${compatDudosos && !conLLM ? ' (convención histórica: dudosos sin LLM = sin riesgo)' : ''}`);
  console.log(`   Precisión de tema:       ${pct(m.precisionTema)} (${m.conteos.tema.ok}/${m.conteos.tema.total})`);
  console.log(`🚨 Graves que no alertaron: ${m.gravesPerdidos.length}`);
  m.gravesPerdidos.forEach((g) => console.log(`   - "${g.texto}" (esperado ${g.esperado}, obtuvo ${g.obtenido})`));
  console.log(`🚨 Falsas alarmas graves: ${m.falsasAlarmas.length}`);
  m.falsasAlarmas.forEach((g) => console.log(`   - "${g.texto}" (obtuvo ${g.obtenido})`));
  if (m.cuotaAgotada) console.log('\n⛔ Se agotó la cuota diaria del proveedor: la medición quedó incompleta.');
}
