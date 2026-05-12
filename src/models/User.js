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
          return /^\d{6,10}$/.test(v);
        },
        message: "La cédula debe contener entre 6 y 10 dígitos numéricos",
      },
    },
    correo: {
      type: String,
      required: false,   // ← padre puede registrarse sin correo
      sparse: true,      // ← permite múltiples null sin violar unique
      unique: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // sin correo → válido
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
      default: true,  // true al crearse, false después de completar onboarding
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
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    esTitular: {
      type: Boolean,
      default: true,
    },
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