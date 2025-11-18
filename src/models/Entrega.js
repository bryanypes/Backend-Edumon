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
    nota: { 
      type: Number,
      min: [0, 'La nota mínima es 0'],
      max: [100, 'La nota máxima es 100']
    },
    comentario: { 
      type: String,
      trim: true,
      maxlength: [1000, 'El comentario no puede exceder 1000 caracteres']
    },
    fechaCalificacion: { 
      type: Date
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

// Índices para mejorar búsquedas
entregaSchema.index({ tareaId: 1, padreId: 1 }, { unique: true });
entregaSchema.index({ padreId: 1, estado: 1 });

// Virtual para saber si está calificada
entregaSchema.virtual('estaCalificada').get(function() {
  return this.calificacion && this.calificacion.nota !== undefined;
});

export default mongoose.model("Entrega", entregaSchema);