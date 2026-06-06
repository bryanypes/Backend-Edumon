import mongoose from 'mongoose';

const eventoSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título es requerido'],
    trim: true,
    minlength: [3, 'El título debe tener al menos 3 caracteres'],
    maxlength: [200, 'El título no puede exceder 200 caracteres']
  },
  descripcion: {
    type: String,
    required: [true, 'La descripción es requerida'],
    trim: true,
    minlength: [10, 'La descripción debe tener al menos 10 caracteres']
  },
  fechaInicio: {
    type: Date,
    required: [true, 'La fecha de inicio es requerida'],
    validate: {
      validator: function(v) { return v >= new Date(); },
      message: 'La fecha de inicio debe ser futura'
    }
  },
  fechaFin: {
    type: Date,
    required: [true, 'La fecha de fin es requerida'],
    validate: {
      validator: function(v) { return v > this.fechaInicio; },
      message: 'La fecha de fin debe ser posterior a la fecha de inicio'
    }
  },
  hora: {
    type: String,
    required: [true, 'La hora es requerida'],
    validate: {
      validator: function(v) { return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v); },
      message: 'La hora debe estar en formato HH:MM (24 horas)'
    }
  },
  ubicacion: {
    type: String,
    required: [true, 'La ubicación es requerida'],
    trim: true
  },
  docenteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El docente es requerido']
  },
  // Imagen de portada o logo representativo del evento
  imagenPortada: {
    url: { type: String, default: null },
    publicId: { type: String, default: null }
  },
  // Adjunto adicional (PDF, documento, etc.)
  adjuntos: {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    nombre: { type: String, default: null }
  },
  cursosIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Curso',
    required: true
  }],
  categoria: {
    type: String,
    enum: {
      values: ['escuela_padres', 'tarea', 'institucional'],
      message: 'La categoría debe ser: escuela_padres, tarea o institucional'
    },
    required: [true, 'La categoría es requerida']
  },
  estado: {
    type: String,
    enum: ['programado', 'en_curso', 'finalizado', 'cancelado'],
    default: 'programado'
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

eventoSchema.index({ docenteId: 1, fechaInicio: -1 });
eventoSchema.index({ cursosIds: 1, estado: 1 });
eventoSchema.index({ categoria: 1, fechaInicio: -1 });

eventoSchema.virtual('participantes', {
  ref: 'Curso',
  localField: 'cursosIds',
  foreignField: '_id'
});

// Virtual: etiqueta legible de la categoría
eventoSchema.virtual('categoriaLabel').get(function() {
  const labels = {
    escuela_padres: 'Escuela de Padres',
    tarea: 'Tarea',
    institucional: 'Institucional'
  };
  return labels[this.categoria] || this.categoria;
});

eventoSchema.methods.haComenzado = function() {
  return new Date() >= this.fechaInicio;
};

eventoSchema.methods.haFinalizado = function() {
  return new Date() >= this.fechaFin;
};

eventoSchema.pre('save', function(next) {
  const ahora = new Date();
  if (ahora >= this.fechaFin) {
    this.estado = 'finalizado';
  } else if (ahora >= this.fechaInicio && ahora < this.fechaFin) {
    this.estado = 'en_curso';
  }
  next();
});

export default mongoose.model('Evento', eventoSchema);