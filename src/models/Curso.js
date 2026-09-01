import mongoose from "mongoose";

const participanteSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  etiqueta: {
    type: String,
    enum: ["padre", "docente"],
    required: true
  }
}, { _id: false });

const cursoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  descripcion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  fotoPortadaUrl: {
    type: String,
    default: null,
    validate: {
      validator: function (v) {
        if (!v) return true;

        const urlCloudinary = /^https:\/\/res\.cloudinary\.com\/.+/i.test(v);
        const urlExterna = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
        const rutaLocal = /^\/uploads\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v); // compatibilidad

        return urlCloudinary || urlExterna || rutaLocal;
      },
      message: 'La URL de la foto debe ser válida'
    }
  },
  fotoPortadaPublicId: {
    type: String,
    default: null
  },
  color: {
    type: String,
    default: null,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v);
      },
      message: 'El color debe ser un código hexadecimal válido (ej. #3B82F6)'
    }
  },
  docenteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    validate: {
      validator: async function (v) {
        const user = await mongoose.model('User').findById(v);
        return user && user.rol === 'docente';
      },
      message: 'El docenteId debe corresponder a un usuario con rol docente'
    }
  },
  participantes: {
    type: [participanteSchema],
    default: []
  },
  fechaCreacion: {
    type: Date,
    default: Date.now
  },
  estado: {
    type: String,
    enum: ["activo", "archivado"],
    default: "activo"
  },
  institucionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institucion',
    required: true,
    index: true
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

cursoSchema.index({ docenteId: 1 });
cursoSchema.index({ estado: 1 });
cursoSchema.index({ 'participantes.usuarioId': 1 });

cursoSchema.virtual('totalParticipantes').get(function () {
  return Array.isArray(this.participantes) ? this.participantes.length : 0;
});

cursoSchema.methods.esParticipante = function (usuarioId) {
  return this.participantes.some(p => p.usuarioId.toString() === usuarioId.toString());
};

cursoSchema.methods.agregarParticipante = function (usuarioId, etiqueta) {
  if (!this.esParticipante(usuarioId)) {
    this.participantes.push({ usuarioId, etiqueta });
  }
};

cursoSchema.methods.removerParticipante = function (usuarioId) {
  this.participantes = this.participantes.filter(
    p => p.usuarioId.toString() !== usuarioId.toString()
  );
};

export default mongoose.model("Curso", cursoSchema);