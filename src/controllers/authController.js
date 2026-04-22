import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { eventBus, EVENTOS } from '../events/EventBus.js';

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
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { nombre, apellido, cedula, correo, contraseña, rol, telefono } = req.body;

    // Verificar si ya existe un usuario con ese correo o teléfono
    const existingUser = await User.findOne({
      $or: [
        { correo },
        { telefono }
      ]
    });

    if (existingUser) {
      const field = existingUser.correo === correo ? 'correo' : 'teléfono';
      return res.status(409).json({
        message: `Ya existe un usuario con este ${field}`
      });
    }

    // Crear nuevo usuario
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

    // Generar token
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
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { telefono, contraseña } = req.body;

    // Buscar usuario por teléfono
    const user = await User.findOne({ telefono });

    if (!user) {
      return res.status(401).json({
        message: "Credenciales inválidas"
      });
    }

    // Verificar si el usuario está activo
    if (user.estado !== 'activo') {
      return res.status(401).json({
        message: "Usuario suspendido. Contacte al administrador."
      });
    }

    // Verificar contraseña
    const isPasswordValid = await user.comparePassword(contraseña);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Credenciales inválidas"
      });
    }

    // GUARDAR SI ES PRIMER INICIO (antes de modificarlo)
    const esPrimerInicio = user.primerInicioSesion;

    // Actualizar último acceso
    user.ultimoAcceso = new Date();

    // MARCAR COMO NO PRIMER INICIO después del login
    if (user.primerInicioSesion) {
      user.primerInicioSesion = false;
    }

    await user.save();

    // Generar token
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
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Obtener perfil del usuario autenticado
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
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
    res.status(500).json({
      message: "Error interno del servidor"
    });
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
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await user.comparePassword(contraseñaActual);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        message: "La contraseña actual es incorrecta"
      });
    }

    // Actualizar contraseña
    user.contraseña = contraseñaNueva;
    await user.save();

    res.json({
      message: "Contraseña cambiada exitosamente"
    });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Logout 
export const logout = async (req, res) => {
  try {
    res.json({
      message: "Logout exitoso"
    });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};