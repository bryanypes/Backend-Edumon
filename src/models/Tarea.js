import mongoose from "mongoose";

const archivoAdjuntoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['archivo', 'enlace'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  nombre: {
    type: String,
    required: true
  },
  // Solo para archivos subidos
  publicId: {
    type: String
  },
  formato: {
    type: String
  },
  tamano: {
    type: Number
  },
  // Solo para enlaces
  descripcion: {
    type: String
  }
}, { _id: false });

const tareaSchema = new mongoose.Schema({
  titulo: { 
    type: String, 
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [200, 'El título no puede exceder 200 caracteres']
  },
  descripcion: { 
    type: String,
    trim: true,
    maxlength: [2000, 'La descripción no puede exceder 2000 caracteres']
  },
  fechaCreacion: { 
    type: Date, 
    default: Date.now 
  },
  fechaEntrega: { 
    type: Date,
    required: [true, 'La fecha de entrega es obligatoria']
  },
  docenteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'El ID del docente es obligatorio']
  },
  etiquetas: { 
    type: [String],
    default: []
  },
  tipoEntrega: { 
    type: String, 
    enum: {
      values: ["texto", "archivo", "multimedia", "enlace", "presencial", "grupal"],
      message: '{VALUE} no es un tipo de entrega válido'
    },
    required: [true, 'El tipo de entrega es obligatorio']
  },
  archivosAdjuntos: {
    type: [archivoAdjuntoSchema],
    default: []
  },
  criterios: { 
    type: String,
    trim: true
  },
  estado: { 
    type: String, 
    enum: {
      values: ["publicada", "cerrada"],
      message: '{VALUE} no es un estado válido'
    },
    default: "publicada" 
  },
  cursoId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Curso',
    required: [true, 'El ID del curso es obligatorio']
  },
  moduloId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Modulo',
    required: [true, 'El ID del módulo es obligatorio']
  },
  asignacionTipo: {
    type: String,
    enum: {
      values: ["todos", "seleccionados"],
      message: '{VALUE} no es un tipo de asignación válido'
    },
    default: "todos",
    required: [true, 'El tipo de asignación es obligatorio']
  },
  participantesSeleccionados: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    default: [],
    validate: {
      validator: function(participantes) {
        if (this.asignacionTipo === "seleccionados" && participantes.length === 0) {
          return false;
        }
        return true;
      },
      message: 'Debe seleccionar al menos un participante cuando el tipo de asignación es "seleccionados"'
    }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

tareaSchema.index({ cursoId: 1, moduloId: 1, fechaEntrega: -1 });
tareaSchema.index({ docenteId: 1, estado: 1 });
tareaSchema.index({ participantesSeleccionados: 1 });

tareaSchema.virtual('estaVencida').get(function() {
  return this.fechaEntrega < new Date() && this.estado === 'publicada';
});

tareaSchema.virtual('totalArchivos').get(function() {
  return this.archivosAdjuntos ? this.archivosAdjuntos.length : 0;
});

tareaSchema.virtual('soloArchivos').get(function() {
  return this.archivosAdjuntos?.filter(a => a.tipo === 'archivo') || [];
});

tareaSchema.virtual('soloEnlaces').get(function() {
  return this.archivosAdjuntos?.filter(a => a.tipo === 'enlace') || [];
});

tareaSchema.pre('save', function(next) {
  if (this.asignacionTipo === 'todos') {
    this.participantesSeleccionados = [];
  }
  next();
});

export default mongoose.model("Tarea", tareaSchema);