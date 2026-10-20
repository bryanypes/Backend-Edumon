import mongoose from 'mongoose';

// Clasificación de ruta de una situación de riesgo (services/ia/rutaAtencion.js).
// Pendiente de validación por orientación/convivencia. Opcional: las alertas y
// mensajes anteriores quedan con null.
const fundamentoSchema = new mongoose.Schema({
  norma: String,
  articulo: String,
  fuente: String,
  texto: String,
}, { _id: false });

const rutaAtencionSchema = new mongoose.Schema({
  ambito: { type: String, enum: ['escolar', 'hogar', 'personal'], required: true },
  // solo en ámbito escolar (Decreto 1965 de 2013, art. 40)
  tipoLey1620: { type: String, enum: ['I', 'II', 'III', null], default: null },
  protocolo: { type: String, default: null },
  criterio: { type: String, default: null },
  fundamento: { type: [fundamentoSchema], default: [] },
  // texto oficial que no se pudo obtener (no se reconstruye de memoria)
  fuentePendiente: { type: String, default: null },
  pendienteValidacion: { type: Boolean, default: true },
  nota: { type: String, default: null },
}, { _id: false });

export default rutaAtencionSchema;
