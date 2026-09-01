import mongoose from "mongoose";

const archivoSchema = new mongoose.Schema({
  url: { 
    type: String, 
    required: true 
  },
  publicId: { 
    type: String, 
    required: true 
  },
  tipo: { 
    type: String, 
    enum: ["imagen", "video", "pdf"], 
    required: true 
  },
  nombre: { 
    type: String, 
    required: true 
  }
}, { _id: false });

const foroSchema = new mongoose.Schema({
  titulo: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  descripcion: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 2000
  },
  docenteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    validate: {
      validator: async function(v) {
        const user = await mongoose.model('User').findById(v);
        return user && (user.rol === 'docente' || user.rol === 'administrador');
      },
      message: 'El creador debe ser docente o administrador'
    }
  },
  cursoId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Curso',
    required: true
  },
  archivos: {
    type: [archivoSchema],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 5;
      },
      message: 'No se pueden adjuntar más de 5 archivos'
    }
  },
  fechaCreacion: { 
    type: Date, 
    default: Date.now 
  },
  estado: { 
    type: String, 
    enum: ["abierto", "cerrado"], 
    default: "abierto" 
  },
  publico: { 
    type: Boolean, 
    default: false 
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

foroSchema.index({ docenteId: 1 });
foroSchema.index({ cursoId: 1 });
foroSchema.index({ estado: 1 });
foroSchema.index({ fechaCreacion: -1 });

foroSchema.virtual('totalMensajes', {
  ref: 'MensajeForo',
  localField: '_id',
  foreignField: 'foroId',
  count: true
});

foroSchema.methods.estaAbierto = function() {
  return this.estado === 'abierto';
};

foroSchema.methods.tieneAcceso = async function(usuarioId) {
  const curso = await mongoose.model('Curso').findById(this.cursoId);
  if (!curso) return false;

  if (curso.docenteId.toString() === usuarioId.toString()) return true;
  if (this.docenteId.toString() === usuarioId.toString()) return true;

  return curso.esParticipante(usuarioId);
};

export default mongoose.model("Foro", foroSchema);