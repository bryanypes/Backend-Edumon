import mongoose from "mongoose";

const notificacionSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El ID del usuario es obligatorio']
  },
  tipo: {
    type: String,
    enum: {
      values: ["tarea", "entrega", "calificacion", "foro", "evento", "sistema"],
    },
    required: [true, 'El tipo es obligatorio']
  },
  mensaje: {
    type: String,
    required: [true, 'El mensaje es obligatorio'],
    trim: true,
    maxlength: [500, 'El mensaje no puede exceder 500 caracteres']
  },
  leido: {
    type: Boolean,
    default: false
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  referenciaId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'referenciaModelo'
  },
  referenciaModelo: {
    type: String,
    enum: ['Tarea', 'Entrega', 'Curso', 'Modulo', 'User', 'Evento', 'Buzon', 'Foro']
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  prioridad: {
    type: String,
    enum: {
      values: ["baja", "media", "alta", "critica"],
      message: '{VALUE} no es una prioridad válida'
    },
    default: "media"
  },
  canalEnviado: {
    websocket: { type: Boolean, default: false },
    push: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    email: { type: Boolean, default: false }
  },
  agrupacionId: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

notificacionSchema.index({ usuarioId: 1, fecha: -1 });
notificacionSchema.index({ usuarioId: 1, leido: 1 });
notificacionSchema.index({ tipo: 1, fecha: -1 });
notificacionSchema.index({ agrupacionId: 1 });
notificacionSchema.index({ fecha: 1 }, { expireAfterSeconds: 7776000 }); // 90 días

notificacionSchema.virtual('esReciente').get(function () {
  const unDia = 24 * 60 * 60 * 1000;
  return (Date.now() - this.fecha.getTime()) < unDia;
});

notificacionSchema.statics.marcarVariasLeidas = async function (usuarioId, notificacionIds) {
  return this.updateMany(
    {
      usuarioId,
      _id: { $in: notificacionIds }
    },
    { leido: true }
  );
};

notificacionSchema.statics.marcarTodasLeidas = async function (usuarioId) {
  return this.updateMany(
    { usuarioId, leido: false },
    { leido: true }
  );
};

notificacionSchema.statics.obtenerNoLeidas = async function (usuarioId) {
  return this.find({ usuarioId, leido: false })
    .sort({ fecha: -1 })
    .populate('referenciaId');
};

notificacionSchema.statics.contarNoLeidas = async function (usuarioId) {
  return this.countDocuments({ usuarioId, leido: false });
};

export default mongoose.model("Notificacion", notificacionSchema);