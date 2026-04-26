import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import crypto from 'crypto';
import { enviarCorreoRecuperacion } from '../services/mailService.js';

// Generar JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
};

// Registro de usuario
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { nombre, apellido, cedula, correo, contraseña, rol, telefono } = req.body;

    const existingUser = await User.findOne({
      $or: [{ correo }, { telefono }]
    });

    if (existingUser) {
      const field = existingUser.correo === correo ? 'correo' : 'teléfono';
      return res.status(409).json({
        message: `Ya existe un usuario con este ${field}`
      });
    }

    const newUser = new User({
      nombre,
      apellido,
      cedula,
      correo,
      contraseña,
      rol,
      telefono,
      fechaRegistro: new Date(),
      fotoPerfilUrl: 'https://res.cloudinary.com/djvilfslm/image/upload/v1761514239/fotos-perfil-predeterminadas/avatar1.webp'
    });

    const savedUser = await newUser.save();
    const token = generateToken(savedUser._id);

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
        estado: savedUser.estado
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Login con teléfono y contraseña
export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { telefono, contraseña } = req.body;

    const user = await User.findOne({ telefono });

    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    if (user.estado !== 'activo') {
      return res.status(401).json({
        message: "Usuario suspendido. Contacte al administrador."
      });
    }

    const isPasswordValid = await user.comparePassword(contraseña);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const esPrimerInicio = user.primerInicioSesion;

    user.ultimoAcceso = new Date();
    if (user.primerInicioSesion) {
      user.primerInicioSesion = false;
    }

    await user.save();

    const token = generateToken(user._id);

    res.json({
      message: "Login exitoso",
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        cedula: user.cedula,
        correo: user.correo,
        rol: user.rol,
        telefono: user.telefono,
        estado: user.estado,
        ultimoAcceso: user.ultimoAcceso
      },
      primerInicioSesion: esPrimerInicio
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Obtener perfil del usuario autenticado
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

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
        preferencias: user.preferencias
      }
    });

  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Cambiar contraseña
export const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { contraseñaActual, contraseñaNueva } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const isCurrentPasswordValid = await user.comparePassword(contraseñaActual);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "La contraseña actual es incorrecta" });
    }

    user.contraseña = contraseñaNueva;
    await user.save();

    res.json({ message: "Contraseña cambiada exitosamente" });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Logout
export const logout = async (req, res) => {
  try {
    res.json({ message: "Logout exitoso" });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Solicitar recuperación de contraseña
export const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { correo } = req.body;
    const user = await User.findOne({ correo });

    // Respuesta genérica siempre — no revelar si el correo existe
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

    await enviarCorreoRecuperacion(
      { correo: user.correo, nombre: user.nombre },
      codigo
    );

    res.status(200).json({
      message: "Si el correo está registrado, recibirás un código de recuperación."
    });

  } catch (error) {
    console.error('Error en forgotPassword:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Resetear contraseña con el código
export const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
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