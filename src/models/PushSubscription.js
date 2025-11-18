import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema({
  usuarioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    unique: true
  },
  keys: {
    p256dh: {
      type: String,
      required: true
    },
    auth: {
      type: String,
      required: true
    }
  },
  userAgent: {
    type: String
  },
  activa: {
    type: Boolean,
    default: true
  },
  fechaRegistro: {
    type: Date,
    default: Date.now
  },
  ultimoUso: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// Índices
pushSubscriptionSchema.index({ usuarioId: 1, activa: 1 });
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

// Método para actualizar último uso
pushSubscriptionSchema.methods.actualizarUso = async function() {
  this.ultimoUso = new Date();
  await this.save();
};

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
