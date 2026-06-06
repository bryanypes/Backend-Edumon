import mongoose from "mongoose";

const entregaSchema = new mongoose.Schema({
  tareaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Tarea',
    required: [true, 'El ID de la tarea es obligatorio']
  },
  padreId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'El ID del padre es obligatorio']
  },
  fechaEntrega: { 
    type: Date, 
    default: Date.now 
  },
  archivosAdjuntos: [{
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    nombreOriginal: { type: String, required: true },
    tipoArchivo: { type: String, required: true },
    tamano: { type: Number, required: true }
  }],
  textoRespuesta: { 
    type: String,
    trim: true,
    maxlength: [5000, 'El texto de respuesta no puede exceder 5000 caracteres']
  },
  estado: { 
    type: String, 
    enum: {
      values: ["borrador", "enviada", "tarde"],
      message: '{VALUE} no es un estado válido'
    },
    default: "borrador" 
  },
  calificacion: {
    // valoracion: 1-5 estrellas — reemplaza "nota" (0-100)
    valoracion: { 
      type: Number,
      min: [1, 'La valoración mínima es 1 estrella'],
      max: [5, 'La valoración máxima es 5 estrellas'],
      validate: {
        validator: Number.isInteger,
        message: 'La valoración debe ser un número entero'
      }
    },
    comentario: { 
      type: String,
      trim: true,
      maxlength: [1000, 'El comentario no puede exceder 1000 caracteres']
    },
    fechaCalificacion: { 
      type: Date
    },
    fechaUltimaModificacion: {
      type: Date
    },
    valoracionAnterior: {
      type: Number,
      min: 1,
      max: 5
    },
    docenteId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User'
    }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
entregaSchema.index({ tareaId: 1, padreId: 1 }, { unique: true });
entregaSchema.index({ padreId: 1, estado: 1 });
entregaSchema.index({ 'calificacion.valoracion': 1 });

// Virtual: ¿está valorada?
entregaSchema.virtual('estaCalificada').get(function() {
  return this.calificacion?.valoracion !== undefined && this.calificacion.valoracion !== null;
});

// Virtual: representación en estrellas
entregaSchema.virtual('estrellas').get(function() {
  if (!this.calificacion?.valoracion) return null;
  const n = this.calificacion.valoracion;
  return '⭐'.repeat(n) + '☆'.repeat(5 - n);
});

export default mongoose.model("Entrega", entregaSchema);