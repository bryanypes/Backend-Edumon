import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { AVATAR_PREDETERMINADO } from "../utils/avatarPredeterminado.js";

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
      required: false,
      sparse: true,
      unique: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
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
    // Usado como credencial de login (User.findOne({ telefono })) — indexado por eso
    telefono: { type: String, index: true },
    preferencias: {
      type: [Boolean],
      default: [true, true],
    },
    // ─── Preferencia de modo de pantalla ─────────────────────────────────
    modoOscuro: {
      type: Boolean,
      default: false,
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
      default: AVATAR_PREDETERMINADO, 
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

    // ─── Refresh Tokens ───────────────────────────────────────────────────
    // Se almacenan hasheados. Máximo 5 sesiones simultáneas.
    refreshTokens: {
      type: [
        {
          tokenHash: { type: String, required: true },
          creadoEn:  { type: Date, default: Date.now },
          expiraEn:  { type: Date, required: true },
          userAgent: { type: String, default: '' },
          ip:        { type: String, default: '' },
        }
      ],
      default: [],
      select: false,
    },
  },
  { timestamps: true },
);

// ─── Índice TTL: Mongo limpia automáticamente los refresh tokens expirados
userSchema.index({ 'refreshTokens.expiraEn': 1 }, { expireAfterSeconds: 0 });

// ─── Hash contraseña antes de guardar ─────────────────────────────────────
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

// ─── Comparar contraseña ──────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.contraseña);
};

// ─── No devolver contraseña en JSON ──────────────────────────────────────
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.contraseña;
  delete obj.refreshTokens;
  return obj;
};

export default mongoose.model("User", userSchema);