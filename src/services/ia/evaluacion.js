import { clasificar } from './clasificador.js';

// Métricas de seguridad de Edumon sobre un conjunto de casos etiquetados.
//
// Recall de graves y falsas alarmas se calculan SIEMPRE contra la etiqueta real
// (sin suavizar los casos "dudosos"): es la medida que importa. `riesgoExacto`
// mantiene la convención histórica del conjunto original (sin LLM, un caso
// dudoso se espera sin riesgo) solo si `compatDudosos` es true.

const esGrave = (r) => Boolean(r?.endsWith(':grave'));

export async function evaluarConjunto(casos, { conLLM = false, compatDudosos = false, pausaMs = 0, alCaso } = {}) {
  const graves = { esperados: 0, detectados: 0, categoriaCorrecta: 0 };
  const noGraves = { total: 0, falsasAlarmas: 0 };
  const riesgo = { ok: 0, total: 0 };
  const tema = { ok: 0, total: 0, porSubtema: {} };
  const gravesPerdidos = [];
  const falsasAlarmas = [];
  const fallos = [];
  const proveedores = {};
  let fallbacks = 0;
  let cuotaAgotada = false;

  for (const caso of casos) {
    const r = await clasificar(caso.texto, []);
    const obtenido = r.categoriaRiesgo ? `${r.categoriaRiesgo}:${r.gravedad}` : null;
    const motivos = [];
    if (r.proveedor) proveedores[r.proveedor] = (proveedores[r.proveedor] || 0) + 1;
    if (r.huboFallback) fallbacks += 1;

    if (esGrave(caso.riesgo)) {
      graves.esperados += 1;
      if (esGrave(obtenido)) {
        graves.detectados += 1;
        if (obtenido === caso.riesgo) graves.categoriaCorrecta += 1;
      } else {
        gravesPerdidos.push({ texto: caso.texto, esperado: caso.riesgo, obtenido });
      }
    } else {
      noGraves.total += 1;
      if (esGrave(obtenido)) {
        noGraves.falsasAlarmas += 1;
        falsasAlarmas.push({ texto: caso.texto, esperado: caso.riesgo, obtenido });
      }
    }

    const esperado = compatDudosos && !conLLM && caso.dudoso ? null : caso.riesgo;
    riesgo.total += 1;
    if (obtenido === esperado) riesgo.ok += 1;
    else motivos.push(`riesgo: esperado ${esperado}, obtuvo ${obtenido}`);

    if (caso.subtema !== undefined && (conLLM || !caso.soloLLM)) {
      const validos = [caso.subtema].flat();
      const sub = r.tema?.subtema ?? null;
      const clave = validos[0] ?? 'sin_tema';
      tema.total += 1;
      tema.porSubtema[clave] ??= { ok: 0, total: 0 };
      tema.porSubtema[clave].total += 1;
      if (validos.includes(sub)) { tema.ok += 1; tema.porSubtema[clave].ok += 1; }
      else motivos.push(`tema: esperado ${caso.subtema}, obtuvo ${sub}`);
    }

    if (motivos.length) fallos.push({ texto: caso.texto, motivos, fuente: r.fuente });
    alCaso?.(caso, r, motivos);

    if (/cuota diaria/.test(r.deteccion?.errorIA ?? '')) { cuotaAgotada = true; break; }
    if (pausaMs) await new Promise((ok) => { setTimeout(ok, pausaMs); });
  }

  const tasa = (a, b) => (b ? Number((a / b).toFixed(4)) : null);
  return {
    casos: riesgo.total,
    recallGraves: tasa(graves.detectados, graves.esperados),
    gravesCategoriaCorrecta: tasa(graves.categoriaCorrecta, graves.esperados),
    tasaFalsasAlarmas: tasa(noGraves.falsasAlarmas, noGraves.total),
    riesgoExacto: tasa(riesgo.ok, riesgo.total),
    precisionTema: tasa(tema.ok, tema.total),
    precisionPorTema: Object.fromEntries(Object.entries(tema.porSubtema)
      .map(([k, v]) => [k, { ...v, precision: tasa(v.ok, v.total) }])),
    conteos: { graves, noGraves, riesgo, tema: { ok: tema.ok, total: tema.total } },
    gravesPerdidos,
    falsasAlarmas,
    fallos,
    proveedores,
    fallbacks,
    cuotaAgotada,
  };
}
