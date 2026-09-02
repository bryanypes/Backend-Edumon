import mongoose from 'mongoose';

// Cada documento es una versión del APK de Android. La que tiene activa=true es
// la que se ofrece para descargar en la web y la que la app usa para comparar
// versiones. Las demás quedan como historial para poder volver atrás.
const apkSchema = new mongoose.Schema({
  version: {
    type: String,
    required: [true, 'La versión es obligatoria'],
    trim: true,
    maxlength: [20, 'Máximo 20 caracteres']
  },
  versionCode: {
    type: Number,
    min: [1, 'El versionCode debe ser un entero positivo']
  },
  notas: {
    type: String,
    trim: true,
    maxlength: [2000, 'Máximo 2000 caracteres']
  },
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  tamano: {
    type: Number,
    required: true
  },
  nombreArchivo: {
    type: String,
    trim: true
  },
  obligatoria: {
    type: Boolean,
    default: false
  },
  activa: {
    type: Boolean,
    default: true
  },
  subidaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

apkSchema.index({ activa: 1, createdAt: -1 });

export default mongoose.model('Apk', apkSchema);
