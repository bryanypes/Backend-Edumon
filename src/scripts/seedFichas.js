/**
 * Carga la biblioteca de fichas de crianza de Edumon.
 * No borra nada: inserta o actualiza cada ficha por su título.
 *
 *   npm run seed:fichas
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import FichaCrianza from '../models/FichaCrianza.js';
import { FICHAS_CRIANZA } from '../data/fichasCrianza.js';

export async function cargarFichas() {
  const resultado = await FichaCrianza.bulkWrite(
    FICHAS_CRIANZA.map((ficha) => ({
      updateOne: { filter: { titulo: ficha.titulo }, update: { $set: ficha }, upsert: true },
    })),
  );
  return { insertadas: resultado.upsertedCount, actualizadas: resultado.modifiedCount };
}

const ejecutadoDirecto = process.argv[1]?.endsWith('seedFichas.js');
if (ejecutadoDirecto) {
  if (!process.env.MONGO_URI) {
    console.error('❌ Falta MONGO_URI en el .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const { insertadas, actualizadas } = await cargarFichas();
  console.log(`📚 Fichas de Edumon: ${insertadas} insertadas, ${actualizadas} actualizadas (${FICHAS_CRIANZA.length} en total)`);
  await mongoose.disconnect();
}
