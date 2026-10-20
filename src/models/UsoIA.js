import mongoose from 'mongoose';

// Una fila por llamada exitosa a un proveedor de IA: tokens y latencia, sin
// el contenido del mensaje. Sirve para calcular el costo real (ver costosIA.js).
const usoIASchema = new mongoose.Schema({
  proveedor: { type: String, required: true },
  modelo: { type: String, required: true },
  // qué pidió el servicio: clasificacion_edumon, respuesta_edumon, reto_escuela_padres…
  operacion: { type: String, default: null },
  tokensEntrada: { type: Number, default: 0 },
  tokensSalida: { type: Number, default: 0 },
  latenciaMs: { type: Number, default: null },
  huboFallback: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'en', updatedAt: false } });

usoIASchema.index({ en: -1 });

export default mongoose.model('UsoIA', usoIASchema);
