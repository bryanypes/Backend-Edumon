// Coincidencia aproximada SOLO para las reglas de riesgo GRAVE.
//
// Las familias escriben con errores ("sucidarse", "abuzo", "me kiero matar").
// En vez de reescribir cada regla, se corrige el mensaje HACIA el vocabulario
// de las reglas graves y esas reglas se evalúan también sobre el texto
// corregido. Las reglas moderadas, de atención y de tema no usan esto.
//
// Una palabra del mensaje se corrige solo si:
// - tiene 4 letras o más y NO es una palabra conocida (vocabulario de las
//   reglas, temas, fichas y respuestas): una palabra bien escrita nunca se
//   cambia por otra, y así "mata", "corta" o "toca" no se vuelven alarmas;
// - y coincide con una palabra de las reglas graves por clave fonética del
//   español (b/v, s/z/c, ll/y, qu/k/c, h muda, letras dobles) o a distancia
//   de edición 1 (Damerau-Levenshtein, palabras de 5 letras o más). Las raíces
//   de las reglas ("suicid", "autolesi") se comparan contra el inicio de la palabra.
// Además se expanden abreviaturas de chat: q/k → que, d → de, x → por, xq/pq → porque.

const ABREVIATURAS = { q: 'que', k: 'que', ke: 'que', d: 'de', x: 'por', xq: 'porque', pq: 'porque', porq: 'porque', tb: 'tambien', tmb: 'tambien' };

export const claveFonetica = (palabra) => palabra
  .replace(/ch/g, '#')
  .replace(/qu/g, 'k')
  .replace(/c(?=[ei])/g, 's')
  .replace(/c/g, 'k')
  .replace(/z/g, 's')
  .replace(/v/g, 'b')
  .replace(/ll/g, 'y')
  .replace(/h/g, '')
  .replace(/gu(?=[ei])/g, 'g')
  .replace(/(.)\1+/g, '$1');

// distancia de Damerau-Levenshtein (versión OSA), acotada
export function distancia(a, b, maximo = 2) {
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// palabras literales (≥4 letras) de un patrón; las seguidas de \w son raíces
export function palabrasDePatron(fuente) {
  const palabras = new Set();
  const raices = new Set();
  // se quitan escapes como \b, \s, \w para no confundirlos con letras
  const limpia = fuente.replace(/\\[bsBSdD]/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  for (const m of limpia.matchAll(/[a-z]{4,}(\\w)?/g)) {
    if (m[1]) { raices.add(m[0].slice(0, -2)); continue; }
    palabras.add(m[0]);
    // en los patrones de texto la última palabra se busca como prefijo ("suicid" → "suicidarse")
    if (m.index + m[0].length === limpia.length) raices.add(m[0]);
  }
  return { palabras, raices };
}

/**
 * @param {{ fuentesGraves: string[], vocabulario: Set<string> }} datos
 * @returns {(textoNormalizado: string) => { texto: string, cambios: Array<{de, a}> }}
 */
export function crearCorrector({ fuentesGraves, vocabulario }) {
  const palabras = new Set();
  const raices = new Set();
  for (const fuente of fuentesGraves) {
    const r = palabrasDePatron(fuente);
    r.palabras.forEach((p) => palabras.add(p));
    r.raices.forEach((p) => raices.add(p));
  }
  const listaPalabras = [...palabras];
  const porClave = new Map(listaPalabras.map((p) => [claveFonetica(p), p]));
  const listaRaices = [...raices].filter((r) => r.length >= 5);

  const corregirPalabra = (w) => {
    if (w.length < 4 || palabras.has(w) || vocabulario.has(w)) return null;
    const porFonetica = porClave.get(claveFonetica(w));
    if (porFonetica) return porFonetica;
    if (w.length >= 5) {
      // la conjugación cambia el final ("quemo"/"queme", "quedo"/"queda"): por
      // distancia solo se corrige si las 2 últimas letras coinciden
      const cercana = listaPalabras.find((p) => p.length >= 5 && p.slice(-2) === w.slice(-2) && distancia(w, p, 1) <= 1);
      if (cercana) return cercana;
    }
    // raíz con error al inicio de la palabra ("sucidar" → "suicid" + "ar")
    for (const raiz of listaRaices) {
      if (w.startsWith(raiz)) return null;
      for (const largo of [raiz.length - 1, raiz.length, raiz.length + 1]) {
        if (largo < 4 || largo > w.length) continue;
        const inicio = w.slice(0, largo);
        // mismo principio que arriba: el final de la raíz debe coincidir ("sucid"/"suicid" sí, "quem"/"queme" no)
        if (claveFonetica(inicio) === claveFonetica(raiz)
          || (inicio.slice(-2) === raiz.slice(-2) && distancia(inicio, raiz, 1) <= 1)) return raiz + w.slice(largo);
      }
    }
    return null;
  };

  return (texto) => {
    const cambios = [];
    const corregido = texto.split(/([a-z0-9]+)/).map((parte) => {
      if (!/^[a-z]+$/.test(parte)) return parte;
      const expandida = ABREVIATURAS[parte];
      if (expandida) { cambios.push({ de: parte, a: expandida }); return expandida; }
      const nueva = corregirPalabra(parte);
      if (nueva && nueva !== parte) { cambios.push({ de: parte, a: nueva }); return nueva; }
      return parte;
    }).join('');
    return { texto: corregido, cambios };
  };
}
