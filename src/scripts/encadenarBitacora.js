/**
 * Backfill de la bitácora encadenada de alertas (idempotente).
 *
 *   npm run bitacora:encadenar               # encadena las alertas sin hashes
 *   npm run bitacora:encadenar -- --verificar  # solo informa, no escribe
 *
 * - Una alerta con algún evento sin hash (creada antes de la bitácora) se
 *   encadena completa, en el orden actual del historial.
 * - Una alerta con todos sus eventos ya encadenados NO se toca, aunque la
 *   cadena no cuadre: volver a calcularla escondería una manipulación. Esas
 *   se reportan como "rotas" para revisión.
 * Correrlo dos veces no cambia nada la segunda vez.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import AlertaRiesgo from '../models/AlertaRiesgo.js';
import { encadenar, verificarCadena } from '../services/ia/bitacora.js';

const sinEncadenar = (alerta) => (alerta.historial ?? []).some((e) => !e.hash);

export async function encadenarBitacoraPendiente({ soloVerificar = false } = {}) {
  const resumen = { revisadas: 0, encadenadas: 0, yaEncadenadas: 0, rotas: [] };
  const cursor = AlertaRiesgo.find({}).select('institucionId usuarioId categoria origen mensajeDisparador estado historial').lean().cursor();

  for await (const alerta of cursor) {
    resumen.revisadas += 1;
    if (!sinEncadenar(alerta)) {
      resumen.yaEncadenadas += 1;
      const verificacion = verificarCadena(alerta);
      if (!verificacion.valida) resumen.rotas.push({ alertaId: alerta._id, ...verificacion });
      continue;
    }
    if (soloVerificar) { resumen.encadenadas += 1; continue; }

    const eventos = (alerta.historial ?? []).map(({ seq, hashAnterior, hash, ...evento }) => evento);
    const historial = encadenar(alerta, [], eventos);
    // condición: el historial sigue igual de largo y aún tiene eventos sin hash
    const { modifiedCount } = await AlertaRiesgo.updateOne(
      { _id: alerta._id, historial: { $size: eventos.length }, 'historial.hash': null },
      { $set: { historial } },
    );
    resumen.encadenadas += modifiedCount;
  }
  return resumen;
}

const ejecutadoDirecto = process.argv[1]?.endsWith('encadenarBitacora.js');
if (ejecutadoDirecto) {
  const soloVerificar = process.argv.includes('--verificar');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const r = await encadenarBitacoraPendiente({ soloVerificar });
  console.log(`Alertas revisadas: ${r.revisadas}`);
  console.log(`${soloVerificar ? 'Por encadenar' : 'Encadenadas ahora'}: ${r.encadenadas}`);
  console.log(`Ya encadenadas: ${r.yaEncadenadas}`);
  console.log(`Con la cadena rota (no se tocan, revisar): ${r.rotas.length}`);
  r.rotas.forEach((x) => console.log(`  - ${x.alertaId}: evento ${x.rotaEn?.indice ?? '—'} (${x.rotaEn?.motivo ?? 'estado incoherente'})`));
  await mongoose.disconnect();
}
