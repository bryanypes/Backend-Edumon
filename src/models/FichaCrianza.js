import mongoose from 'mongoose';
import { EJES_CRIANZA } from '../config/edumonIA.js';

// Biblioteca curada: Edumon solo responde con lo que hay aquí, nunca con
// conocimiento propio del modelo.
const fichaCrianzaSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: 150,
  },
  eje: {
    type: String,
    enum: EJES_CRIANZA,
    required: [true, 'El eje es obligatorio'],
  },
  // libre y en snake_case (ej. 'pantallas', 'rabietas'); el clasificador lo usa para buscar
  subtema: {
    type: String,
    required: [true, 'El subtema es obligatorio'],
    trim: true,
    lowercase: true,
    maxlength: 60,
  },
  edadMin: {
    type: Number,
    min: 0,
    max: 25,
    default: 0,
  },
  edadMax: {
    type: Number,
    min: 0,
    max: 25,
    default: 18,
    validate: {
      validator: function (v) {
        return this.edadMin == null || v >= this.edadMin;
      },
      message: 'La edad máxima debe ser mayor o igual a la mínima',
    },
  },
  contenido: {
    type: String,
    required: [true, 'El contenido es obligatorio'],
    trim: true,
    maxlength: 4000,
  },
  // práctica de ~5 minutos con la que cierra la respuesta
  practica: {
    type: String,
    required: [true, 'La práctica es obligatoria'],
    trim: true,
    maxlength: 1000,
  },
  fuente: {
    nombre: { type: String, required: [true, 'La fuente es obligatoria'], trim: true },
    url: { type: String, trim: true, default: null },
  },
  // videos o artículos con enlace exacto, revisados por orientación (opcional)
  recursos: {
    type: [{
      _id: false,
      tipo: { type: String, enum: ['video', 'articulo'], required: true },
      titulo: { type: String, trim: true, required: true },
      url: { type: String, trim: true, required: true },
    }],
    default: [],
  },
  // profesional que revisó la ficha (orientador, psicólogo)
  validadoPor: {
    type: String,
    trim: true,
    default: null,
  },
  activo: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

fichaCrianzaSchema.index({ eje: 1, subtema: 1, activo: 1 });

export default mongoose.model('FichaCrianza', fichaCrianzaSchema);
