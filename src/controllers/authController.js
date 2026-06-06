import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import crypto from 'crypto';
import { enviarCorreoRecuperacion } from '../services/mailService.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';

const AVATAR_PREDETERMINADO = 'https://res.cloudinary.com/djvilfslm/image/upload/v1761514239/fotos-perfil-predeterminadas/avatar1.webp';

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      rol: user.rol,
      primerInicioSesion: user.primerInicioSesion ?? false,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
};

// ─── Registro ────────────────────────────────
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { nombre, apellido, cedula, correo, contraseña, rol, telefono, institucionId } = req.body;

    // Normalizar teléfono al registrar
    const telefonoNormalizado = normalizarTelefono(telefono);
    if (telefono && !telefonoNormalizado) {
      return res.status(400).json({ message: "El número de teléfono no es válido" });
    }

    const existingCedula = await User.findOne({ cedula });
    if (existingCedula) {
      return res.status(409).json({ message: "Ya existe un usuario con esta cédula" });
    }

    const existingUser = await User.findOne({
      $or: [
        ...(correo ? [{ correo }] : []),
        ...(telefonoNormalizado ? [{ telefono: telefonoNormalizado }] : [])
      ]
    });
    if (existingUser) {
      const field = existingUser.correo === correo ? 'correo' : 'teléfono';
      return res.status(409).json({ message: `Ya existe un usuario con este ${field}` });
    }

    let institucionFinal = null;
    if (rol === 'docente' || rol === 'administrador') {
      institucionFinal = institucionId || null;
    }

    const newUser = new User({
      nombre, apellido, cedula, correo, contraseña, rol,
      telefono: telefonoNormalizado,
      institucionId: institucionFinal,
      fechaRegistro: new Date(),
      fotoPerfilUrl: AVATAR_PREDETERMINADO
    });

    const savedUser = await newUser.save();
    const token = generateToken(savedUser);

    eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, savedUser);

    res.status(201).json({
      message: "Usuario registrado exitosamente",
      token,
      user: {
        id: savedUser._id,
        nombre: savedUser.nombre,
        apellido: savedUser.apellido,
        cedula: savedUser.cedula,
        correo: savedUser.correo,
        rol: savedUser.rol,
        telefono: savedUser.telefono,
        estado: savedUser.estado,
        institucionId: savedUser.institucionId,
        fotoPerfilUrl: savedUser.fotoPerfilUrl,
        primerInicioSesion: savedUser.primerInicioSesion
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Login ────────────────────────────────────
export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { telefono, contraseña } = req.body;

    // CORRECCIÓN: normalizar antes de buscar en BD
    const telefonoNormalizado = normalizarTelefono(telefono);
    if (!telefonoNormalizado) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = await User.findOne({ telefono: telefonoNormalizado });
    if (!user) return res.status(401).json({ message: "Credenciales inválidas" });

    if (user.estado !== 'activo') {
      return res.status(401).json({ message: "Usuario suspendido. Contacte al administrador." });
    }

    const isPasswordValid = await user.comparePassword(contraseña);
    if (!isPasswordValid) return res.status(401).json({ message: "Credenciales inválidas" });

    const esPrimerInicio = user.primerInicioSesion;
    user.ultimoAcceso = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      message: "Login exitoso",
      token,
      primerInicioSesion: esPrimerInicio,
      user: {
        id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        cedula: user.cedula,
        correo: user.correo,
        rol: user.rol,
        telefono: user.telefono,
        estado: user.estado,
        ultimoAcceso: user.ultimoAcceso,
        institucionId: user.institucionId,
        fotoPerfilUrl: user.fotoPerfilUrl,
        primerInicioSesion: esPrimerInicio,
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Perfil ───────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    res.json({
      user: {
        id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        cedula: user.cedula,
        correo: user.correo,
        rol: user.rol,
        telefono: user.telefono,
        estado: user.estado,
        fechaRegistro: user.fechaRegistro,
        ultimoAcceso: user.ultimoAcceso,
        fotoPerfilUrl: user.fotoPerfilUrl,
        preferencias: user.preferencias,
        institucionId: user.institucionId,
        primerInicioSesion: user.primerInicioSesion
      }
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Cambiar contraseña ───────────────────────
export const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { contraseñaActual, contraseñaNueva } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const isCurrentPasswordValid = await user.comparePassword(contraseñaActual);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "La contraseña actual es incorrecta" });
    }

    user.contraseña = contraseñaNueva;
    user.primerInicioSesion = false;
    await user.save();

    res.json({ message: "Contraseña cambiada exitosamente" });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Logout ───────────────────────────────────
export const logout = async (req, res) => {
  try {
    res.json({ message: "Logout exitoso" });
  } catch (error) {
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Recuperación por CORREO ──────────────────
export const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { correo } = req.body;
    const user = await User.findOne({ correo });

    if (!user) {
      return res.status(200).json({
        message: "Si el correo está registrado, recibirás un código de recuperación."
      });
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    user.resetPasswordToken = codigoHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await enviarCorreoRecuperacion({ correo: user.correo, nombre: user.nombre }, codigo);

    res.status(200).json({
      message: "Si el correo está registrado, recibirás un código de recuperación."
    });
  } catch (error) {
    console.error('Error en forgotPassword:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Recuperación por TELÉFONO ────────────────
export const forgotPasswordPhone = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { telefono } = req.body;

    // CORRECCIÓN: normalizar antes de buscar — cubre todos los formatos del usuario
    const telefonoNormalizado = normalizarTelefono(telefono);
    if (!telefonoNormalizado) {
      // Respuesta genérica — no revelar si el formato es inválido
      return res.status(200).json({
        message: "Si el número está registrado, recibirás un código de recuperación por WhatsApp."
      });
    }

    const user = await User.findOne({ telefono: telefonoNormalizado });
    if (!user) {
      return res.status(200).json({
        message: "Si el número está registrado, recibirás un código de recuperación por WhatsApp."
      });
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    user.resetPasswordToken = codigoHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await enviarSMSRecuperacion(telefonoNormalizado, user.nombre, codigo);

    res.status(200).json({
      message: "Si el número está registrado, recibirás un código de recuperación por WhatsApp."
    });
  } catch (error) {
    console.error('Error en forgotPasswordPhone:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Reset por correo ─────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { correo, codigo, contraseñaNueva } = req.body;
    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    const user = await User.findOne({
      correo,
      resetPasswordToken: codigoHash,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "Código inválido o expirado." });
    }

    user.contraseña = contraseñaNueva;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({ message: "Contraseña actualizada exitosamente." });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Reset por teléfono ───────────────────────
export const resetPasswordPhone = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Errores de validación", errors: errors.array() });
    }

    const { telefono, codigo, contraseñaNueva } = req.body;

    // CORRECCIÓN: normalizar antes de buscar
    const telefonoNormalizado = normalizarTelefono(telefono);
    if (!telefonoNormalizado) {
      return res.status(400).json({ message: "Código inválido o expirado." });
    }

    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    const user = await User.findOne({
      telefono: telefonoNormalizado,
      resetPasswordToken: codigoHash,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "Código inválido o expirado." });
    }

    user.contraseña = contraseñaNueva;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({ message: "Contraseña actualizada exitosamente." });
  } catch (error) {
    console.error('Error en resetPasswordPhone:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─── Utilidad interna: WhatsApp SMS ──────────
async function enviarSMSRecuperacion(telefonoNormalizado, nombre, codigo) {
  const twilio = (await import('twilio')).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const mensaje = `🔐 Edumon\n\nHola ${nombre}, tu código de recuperación es:\n\n*${codigo}*\n\nExpira en 15 minutos. Si no lo solicitaste, ignora este mensaje.`;

  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${telefonoNormalizado}`,
    body: mensaje
  });
}