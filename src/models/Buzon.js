import mongoose from 'mongoose';

const buzonSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  correo: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  telefono: {
    type: String,
    required: true,
    trim: true
  },
  mensaje: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },
  leido: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

export default mongoose.model('Buzon', buzonSchema);