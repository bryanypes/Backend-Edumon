import mongoose from 'mongoose';

const institucionSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    maxlength: [150, 'Máximo 150 caracteres']
  },
  nit: {
    type: String,
    trim: true,
    required: [true, 'El NIT es obligatorio']
  },
  direccion: { type: String, trim: true },
  telefono: { type: String, trim: true },
  correo: { type: String, trim: true, lowercase: true },
  logoUrl: { type: String, default: null },
  logoPublicId: { type: String, default: null },
  adminId: {
    // Admin del colegio — rol: 'administrador'
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  activo: { type: Boolean, default: true },
  codigo: {
    // Código único para que docentes/padres se identifiquen
    type: String,
    uppercase: true
  }
}, { timestamps: true });

// Generar código único antes de guardar
institucionSchema.pre('save', async function (next) {
  if (!this.codigo) {
    let codigo, existe = true;
    while (existe) {
      const rand = Array.from({ length: 6 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
      ).join('');
      codigo = `EDU-${rand}`;
      existe = await mongoose.model('Institucion').findOne({ codigo });
    }
    this.codigo = codigo;
  }
  next();
});

institucionSchema.index({ nit: 1 }, { unique: true });
institucionSchema.index({ codigo: 1 }, { unique: true });
institucionSchema.index({ adminId: 1 });

export default mongoose.model('Institucion', institucionSchema);