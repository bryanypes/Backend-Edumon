// src/models/PerfilFamiliar.js
import mongoose from 'mongoose';

// sin credenciales propias, se accede desde la sesión del titular (estilo perfiles de Netflix)
const perfilFamiliarSchema = new mongoose.Schema({
  titularId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  nombre: {
    type: String,
    required: [true, 'El nombre del perfil es obligatorio'],
    trim: true,
    maxlength: [50, 'Máximo 50 caracteres']
  },
  avatarUrl: {
    type: String,
    default: null
  },
  fcmToken: {
    type: String,
    default: null
  },
  fcmTokenActualizadoEn: {
    type: Date,
    default: null
  },
  activo: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

perfilFamiliarSchema.index({ titularId: 1, activo: 1 });

export default mongoose.model('PerfilFamiliar', perfilFamiliarSchema);