import mongoose from "mongoose";

const moduloSchema = new mongoose.Schema({
  cursoId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Curso',
    required: [true, 'El ID del curso es obligatorio']
  },
  titulo: { 
    type: String, 
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [200, 'El título no puede exceder 200 caracteres']
  },
  descripcion: { 
    type: String,
    trim: true,
    maxlength: [1000, 'La descripción no puede exceder 1000 caracteres']
  },
  estado: { 
    type: String, 
    enum: ["activo", "inactivo"], 
    default: "activo" 
  },
  fechaCreacion: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para mejorar búsquedas
moduloSchema.index({ cursoId: 1, fechaCreacion: -1 });
moduloSchema.index({ estado: 1 });

// Método para verificar si el módulo pertenece a un curso
moduloSchema.methods.perteneceACurso = function(cursoId) {
  return this.cursoId.toString() === cursoId.toString();
};

export default mongoose.model("Modulo", moduloSchema);