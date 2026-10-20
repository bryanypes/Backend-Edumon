import mongoose from 'mongoose';

// Un documento por aceptación: si el padre revoca y vuelve a aceptar, o si
// cambia la versión del texto, queda el historial completo (Ley 1581 exige
// poder demostrar cuándo y qué versión autorizó).
const consentimientoIASchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // null = el titular de la cuenta; si no, el perfil familiar que aceptó
  perfilId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PerfilFamiliar',
    default: null,
  },
  version: {
    type: String,
    required: true,
  },
  aceptadoEn: {
    type: Date,
    default: Date.now,
  },
  revocadoEn: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

consentimientoIASchema.index({ usuarioId: 1, perfilId: 1, version: 1, revocadoEn: 1 });

consentimientoIASchema.statics.obtenerVigente = function (usuarioId, perfilId, version) {
  return this.findOne({
    usuarioId,
    perfilId: perfilId || null,
    version,
    revocadoEn: null,
  });
};

export default mongoose.model('ConsentimientoIA', consentimientoIASchema);
