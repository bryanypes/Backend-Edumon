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

const mensajeForoSchema = new mongoose.Schema({
  foroId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Foro',
    required: true
  },
  usuarioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  contenido: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 1500
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
  respuestaA: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'MensajeForo',
    default: null
  },
  likes: { 
    type: Number, 
    default: 0,
    min: 0
  },
  likedBy: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: []
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

mensajeForoSchema.index({ foroId: 1, fechaCreacion: -1 });
mensajeForoSchema.index({ usuarioId: 1 });
mensajeForoSchema.index({ respuestaA: 1 });

mensajeForoSchema.virtual('usuario', {
  ref: 'User',
  localField: 'usuarioId',
  foreignField: '_id',
  justOne: true
});

mensajeForoSchema.methods.toggleLike = function(usuarioId) {
  const index = this.likedBy.findIndex(id => id.toString() === usuarioId.toString());

  if (index === -1) {
    this.likedBy.push(usuarioId);
    this.likes += 1;
  } else {
    this.likedBy.splice(index, 1);
    this.likes -= 1;
  }
};

mensajeForoSchema.methods.yaLeDioLike = function(usuarioId) {
  return this.likedBy.some(id => id.toString() === usuarioId.toString());
};

export default mongoose.model("MensajeForo", mensajeForoSchema);