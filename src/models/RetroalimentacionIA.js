import mongoose from 'mongoose';

// Calificación de una familia a una respuesta de Edumon (útil / no útil).
// Una por mensaje y perfil: si vuelve a calificar, se reemplaza. No guarda el
// texto de la conversación (que se borra a los 30 días), solo el tipo de
// respuesta y quién la redactó, para medir sin exponer a la familia.
const retroalimentacionSchema = new mongoose.Schema({
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  perfilId: { type: mongoose.Schema.Types.ObjectId, ref: 'PerfilFamiliar', default: null },
  institucionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institucion', default: null },
  conversacionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  mensajeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  util: { type: Boolean, required: true },
  comentario: { type: String, trim: true, maxlength: 500, default: '' },
  // etiqueta libre para separar, por ejemplo, la validación con usuarios reales de la feria
  sesionValidacion: { type: String, trim: true, maxlength: 60, default: null },
  // de qué respuesta se trata (sin el texto)
  tipoRespuesta: { type: String, default: null },
  modoIA: { type: String, default: null },
}, { timestamps: true });

retroalimentacionSchema.index({ mensajeId: 1, usuarioId: 1, perfilId: 1 }, { unique: true });
retroalimentacionSchema.index({ institucionId: 1, createdAt: -1 });

export default mongoose.model('RetroalimentacionIA', retroalimentacionSchema);
