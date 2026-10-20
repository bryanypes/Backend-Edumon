/**
 * Mide al clasificador de Edumon (LLM + reglas) contra los conjuntos de evaluación.
 * Sin GROQ_API_KEY ni OPENAI_API_KEY mide solo las reglas (modo simulado).
 *
 *   npm run eval:edumon                          # conjunto original (193) y holdout
 *   npm run eval:edumon -- --conjunto=holdout    # original | holdout | todos
 *   npm run eval:edumon -- --solo-fallos
 *   npm run eval:edumon -- --guardar             # guarda un JSON por conjunto en src/data/evaluaciones
 *
 * El número que importa es el del holdout (tests/ia/holdout): las reglas nunca
 * se ajustaron mirando esos casos.
 */
import 'dotenv/config';
import { iaDisponible, modeloPrincipal as modelo } from '../services/ia/proveedorIA.js';
import { evaluarConjunto } from '../services/ia/evaluacion.js';
import { CASOS_EVALUACION } from '../data/casosEvaluacionEdumon.js';
import { CASOS_HOLDOUT } from '../../tests/ia/holdout/casosHoldout.js';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { guardarResultado } from '../services/ia/metricasIA.js';

const arg = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
const soloFallos = process.argv.includes('--solo-fallos');
const guardar = process.argv.includes('--guardar');
const versionCodigo = () => {
  const paquete = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const sucio = execSync('git status --porcelain -- src', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() ? '+cambios' : '';
    return `${paquete}+${commit}${sucio}`;
  } catch {
    return paquete;
  }
};
const conjunto = arg('conjunto') || 'todos';
const conLLM = iaDisponible();
// el plan gratuito de Groq admite 8000 tokens por minuto y cada clasificación
// usa ~2600: con menos pausa las llamadas caen a las reglas y la medición no vale
const pausaMs = conLLM ? Number(process.env.EVAL_PAUSA_MS) || 21000 : 0;

const CONJUNTOS = {
  original: { nombre: 'Original (193)', casos: CASOS_EVALUACION, compatDudosos: true },
  holdout: { nombre: 'Holdout v1 (desarrollo)', casos: CASOS_HOLDOUT, compatDudosos: false },
  // escrito por personas que no vieron las reglas: la única métrica final
  ciego: { nombre: 'Ciego', casos: null, compatDudosos: false },
};
const RUTA_CIEGO = new URL('../../tests/ia/ciego/casos.json', import.meta.url);
if (existsSync(RUTA_CIEGO)) CONJUNTOS.ciego.casos = JSON.parse(readFileSync(RUTA_CIEGO, 'utf8'));
const elegidos = conjunto === 'todos' ? ['original', 'holdout', 'ciego'] : [conjunto];
if (!elegidos.every((c) => CONJUNTOS[c])) {
  console.error(`Conjunto desconocido: ${conjunto}. Usa original, holdout, ciego o todos.`);
  process.exit(1);
}

// se calcula al arrancar: los JSON que se van guardando no cuentan como cambios
const VERSION = versionCodigo();
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
console.log(`🧪 Modo: ${conLLM ? `LLM (${modelo()}) + reglas` : 'simulado: solo reglas (sin llaves de IA)'}`);

for (const clave of elegidos) {
  const { nombre, casos, compatDudosos } = CONJUNTOS[clave];
  if (!casos?.length) {
    console.log(`
━━━ ${nombre}: sin casos todavía (tests/ia/ciego/casos.json) ━━━`);
    continue;
  }
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

  if (guardar) {
    const proveedores = Object.keys(m.proveedores);
    const ruta = await guardarResultado({
      fecha: new Date().toISOString(),
      version: VERSION,
      conjunto: clave,
      modo: conLLM ? 'llm' : 'simulado',
      proveedor: conLLM ? (proveedores.length ? proveedores.join(',') : 'ninguno_respondio') : null,
      modelo: conLLM ? modelo() : null,
      completa: !m.cuotaAgotada,
      metricas: m,
    });
    console.log(`💾 Guardado en ${ruta}`);
  }
}
