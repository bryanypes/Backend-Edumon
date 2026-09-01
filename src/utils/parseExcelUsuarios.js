import ExcelJS from 'exceljs';

// cubre celdas con fórmula ({formula, result}) y texto enriquecido ({richText})
// que si no, se serializan como "[object Object]"
function celdaATexto(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    if ('result' in valor) return celdaATexto(valor.result);
    if (Array.isArray(valor.richText)) return valor.richText.map((t) => t.text).join('').trim();
    if ('text' in valor) return celdaATexto(valor.text);
    return '';
  }
  return String(valor).trim();
}

// lee la primera hoja: columnas nombre, apellido, telefono, cedula (A-D), con o sin encabezado
export async function parseFilasUsuarios(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const hoja = workbook.worksheets[0];
  if (!hoja) return [];

  const filas = [];
  hoja.eachRow((row) => {
    filas.push({
      nombre:   celdaATexto(row.getCell(1).value),
      apellido: celdaATexto(row.getCell(2).value),
      telefono: celdaATexto(row.getCell(3).value),
      cedula:   celdaATexto(row.getCell(4).value),
    });
  });

  return filas
    // Salta la fila de encabezados si el archivo la incluye
    .filter((fila) => !(fila.nombre === 'nombre' && fila.apellido === 'apellido'))
    .filter((fila) => fila.nombre && fila.apellido && fila.cedula);
}
