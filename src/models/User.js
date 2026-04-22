import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    apellido: { type: String, required: true },
    cedula: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          // Validación para cédula colombiana (solo números, entre 6-10 dígitos)
          return /^\d{6,10}$/.test(v);
        },
        message: "La cédula debe contener entre 6 y 10 dígitos numéricos",
      },
    },
    correo: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: "El correo electrónico no es válido",
      },
    },
    contraseña: { type: String, required: true, minlength: 6 },
    rol: {
      type: String,
      enum: ["padre", "docente", "administrador", "superadmin"],
      required: true,
    },
    telefono: { type: String },
    preferencias: {
      type: [Boolean],
      default: [true, true],
    },
    fechaRegistro: {
      type: Date,
      default: Date.now,
    },
    ultimoAcceso: { type: Date },
    primerInicioSesion: {
      type: Boolean,
      default: true,
    },
    estado: {
      type: String,
      enum: ["activo", "suspendido"],
      default: "activo",
    },
    fotoPerfilUrl: {
      type: String,
    },
    fcmToken: {
      type: String,
      default: null,
    },
    fcmTokenActualizadoEn: {
      type: Date,
      default: null,
    },
    // Después de fcmTokenActualizadoEn:
    esTitular: {
      type: Boolean,
      default: true // todos los User son titulares por definición
    },
    // Agregar después de familiaId:
    institucionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Institucion",
      default: null,
    },
  },
  { timestamps: true },
);

// Hash de la contraseña antes de guardar
userSchema.pre("save", async function (next) {
  if (!this.isModified("contraseña")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.contraseña = await bcrypt.hash(this.contraseña, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.contraseña);
};

// No devolver la contraseña en las consultas JSON
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.contraseña;
  return userObject;
};

export default mongoose.model("User", userSchema);
