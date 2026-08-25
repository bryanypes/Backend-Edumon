import ExcelJS from 'exceljs';

// Convierte el valor de una celda de ExcelJS a texto plano. Cubre los casos
// que no son un string/número simple: celdas con fórmula (ExcelJS entrega
// {formula, result}) y texto enriquecido ({richText: [...]}) — sin este
// manejo, esas celdas se serializan como "[object Object]" en vez del valor
// real que ve la persona que abre el archivo.
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

/**
 * Lee la primera hoja de un archivo Excel (.xlsx/.xlsm) con columnas
 * nombre, apellido, telefono, cedula en ese orden (columnas A-D), con o sin
 * fila de encabezados. Reemplaza al parseo por CSV que usaban preregistrarDocentesCSV
 * y procesarUsuariosCSV — mismo contrato de salida: filas ya recortadas,
 * exige nombre/apellido/cedula (telefono queda opcional para quien llama).
 */
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
