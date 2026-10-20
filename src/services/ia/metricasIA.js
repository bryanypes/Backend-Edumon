import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resultados de la evaluación de seguridad de Edumon, un JSON por corrida en
// src/data/evaluaciones/ (viajan con el código y con la imagen Docker). Los
// escribe `npm run eval:edumon -- --guardar`; el endpoint solo los lee.
// Nunca se editan a mano: si un número es malo, se reporta tal cual.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const DIR_EVALUACIONES = process.env.EVAL_RESULTADOS_DIR
  || path.resolve(AQUI, '../../data/evaluaciones');

const seguro = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '-');

export async function guardarResultado(resultado, dir = DIR_EVALUACIONES) {
  await fs.mkdir(dir, { recursive: true });
  const nombre = `${seguro(resultado.fecha.replace(/[:]/g, '').slice(0, 15))}_${seguro(resultado.conjunto)}_${seguro(resultado.modo)}.json`;
  const ruta = path.join(dir, nombre);
  await fs.writeFile(ruta, `${JSON.stringify(resultado, null, 2)}\n`, 'utf8');
  return ruta;
}

export async function leerResultados(dir = DIR_EVALUACIONES) {
  let archivos = [];
  try {
    archivos = (await fs.readdir(dir)).filter((a) => a.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const corridas = await Promise.all(archivos.map(async (a) => {
    try {
      return { archivo: a, ...JSON.parse(await fs.readFile(path.join(dir, a), 'utf8')) };
    } catch {
      return null; // un archivo dañado no tumba el endpoint
    }
  }));
  return corridas.filter(Boolean).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// lo que muestra el panel: la última corrida de cada conjunto y modo, más el historial resumido
export async function resumenMetricas(dir = DIR_EVALUACIONES) {
  const corridas = await leerResultados(dir);
  const ultimas = {};
  for (const c of corridas) {
    const clave = `${c.conjunto}:${c.modo}`;
    ultimas[clave] ??= c;
  }
  const resumen = (c) => ({
    fecha: c.fecha,
    version: c.version,
    conjunto: c.conjunto,
    modo: c.modo,
    proveedor: c.proveedor ?? null,
    modelo: c.modelo ?? null,
    casos: c.metricas?.casos ?? null,
    recallGraves: c.metricas?.recallGraves ?? null,
    tasaFalsasAlarmas: c.metricas?.tasaFalsasAlarmas ?? null,
    riesgoExacto: c.metricas?.riesgoExacto ?? null,
    precisionTema: c.metricas?.precisionTema ?? null,
  });
  return {
    nota: 'Resultados reales, sin ajustar. El conjunto que importa es "holdout": las reglas no se ajustaron mirando esos casos.',
    ultimas: Object.values(ultimas).map((c) => ({
      ...resumen(c),
      precisionPorTema: c.metricas?.precisionPorTema ?? {},
      gravesPerdidos: c.metricas?.gravesPerdidos ?? [],
      falsasAlarmas: c.metricas?.falsasAlarmas ?? [],
    })),
    historial: corridas.map(resumen),
  };
}
