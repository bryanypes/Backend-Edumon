import User from '../models/User.js';
import { validationResult } from 'express-validator';
import cloudinary from '../config/cloudinary.js';
import { subirImagenCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';

// Crear usuario (desde panel de administración)
export const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    // CORRECCIÓN: incluir institucionId
    const { nombre, apellido, cedula, correo, contraseña, rol, telefono, institucionId } = req.body;
    // Contraseña temporal estándar si no viene o es igual a la cédula
    const contraseñaFinal = (!contraseña || contraseña === cedula)
      ? `Temporal${cedula}!`
      : contraseña;

    // Verificar si ya existe un usuario con esa cédula
    const existingCedula = await User.findOne({ cedula });
    if (existingCedula) {
      return res.status(409).json({
        message: "Ya existe un usuario con esta cédula"
      });
    }

    // Verificar si el usuario ya existe por correo
    const existingUser = await User.findOne({ correo });
    if (existingUser) {
      return res.status(409).json({
        message: "Ya existe un usuario con este correo electrónico"
      });
    }

    // Verificar si ya existe un usuario con ese teléfono
    if (telefono) {
      const existingTelefono = await User.findOne({ telefono });
      if (existingTelefono) {
        return res.status(409).json({
          message: "Ya existe un usuario con este teléfono"
        });
      }
    }

    const newUser = new User({
      nombre,
      apellido,
      cedula,
      correo,
      contraseña,
      rol,
      telefono,
      // NUEVO: superadmin no tiene institución
      institucionId: rol !== 'superadmin' ? (institucionId || null) : null,
      fotoPerfilUrl: 'https://res.cloudinary.com/djvilfslm/image/upload/v1761514239/fotos-perfil-predeterminadas/avatar1.webp'
    });

    const savedUser = await newUser.save();

    res.status(201).json({
      message: "Usuario creado exitosamente",
      user: savedUser
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Listar usuarios con paginación
export const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const { rol, estado } = req.query;

    const filter = {};
    if (rol) filter.rol = rol;
    if (estado) filter.estado = estado;

    const users = await User.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ fechaRegistro: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Obtener usuario por ID
export const getUserById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
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

    res.json(user);
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Actualizar usuario (NO incluye contraseña — usar ruta dedicada)
export const updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updateData = { ...req.body };

    // Campos protegidos — nunca se actualizan por esta ruta
    delete updateData.contraseña;
    delete updateData._id;
    delete updateData.fechaRegistro;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    res.json({
      message: "Usuario actualizado exitosamente",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Cambiar contraseña (admin sobre cuenta ajena por ID)
export const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { contraseñaActual, nuevaContraseña } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const esValida = await user.comparePassword(contraseñaActual);
    if (!esValida) {
      return res.status(401).json({ message: "La contraseña actual es incorrecta" });
    }

    user.contraseña = nuevaContraseña; // pre-save hook hashea automáticamente
    await user.save();

    res.json({ message: "Contraseña actualizada exitosamente" });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Eliminar usuario (soft delete → estado: suspendido)
export const deleteUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { estado: 'suspendido' },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    res.json({
      message: "Usuario suspendido exitosamente",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error al suspender usuario:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// Obtener fotos de perfil predeterminadas
export const getFotosPredeterminadas = async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'fotos-perfil-predeterminadas/',
      max_results: 50
    });

    const fotos = result.resources.map(foto => ({
      url: foto.secure_url,
      publicId: foto.public_id,
      nombre: foto.public_id.split('/').pop()
    }));

    res.json({
      message: "Fotos predeterminadas obtenidas exitosamente",
      fotos
    });
  } catch (error) {
    console.error('Error al obtener fotos predeterminadas:', error);
    res.status(500).json({
      message: "Error al obtener fotos predeterminadas"
    });
  }
};

// Actualizar foto de perfil (predeterminada o nueva)
export const updateFotoPerfil = async (req, res) => {
  try {
    const { userId } = req.user;
    const { fotoPredeterminadaUrl } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    let nuevaFotoUrl = null;

    // Caso 1: Usuario seleccionó una foto predeterminada
    if (fotoPredeterminadaUrl) {
      nuevaFotoUrl = fotoPredeterminadaUrl;
    }
    // Caso 2: Usuario subió una foto nueva
    else if (req.file) {
      // Eliminar foto anterior si no es predeterminada
      if (user.fotoPerfilUrl && !user.fotoPerfilUrl.includes('fotos-perfil-predeterminadas')) {
        const publicIdAnterior = user.fotoPerfilUrl.split('/').slice(-2).join('/').split('.')[0];
        await eliminarArchivoCloudinary(publicIdAnterior, 'image');
      }

      const resultado = await subirImagenCloudinary(
        req.file.buffer,
        req.file.mimetype,
        'fotos-perfil-usuarios'
      );
      nuevaFotoUrl = resultado.url;
    } else {
      return res.status(400).json({
        message: "Debes seleccionar una foto predeterminada o subir una nueva"
      });
    }

    user.fotoPerfilUrl = nuevaFotoUrl;
    await user.save();

    res.json({
      message: "Foto de perfil actualizada exitosamente",
      fotoPerfilUrl: nuevaFotoUrl
    });
  } catch (error) {
    console.error('Error al actualizar foto de perfil:', error);
    res.status(500).json({
      message: "Error al actualizar foto de perfil",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Actualizar FCM token
export const updateFcmToken = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { userId } = req.user;
    const { fcmToken } = req.body;

    console.log(`Actualizando FCM token para usuario: ${userId}`);

    const user = await User.findByIdAndUpdate(
      userId,
      {
        fcmToken: fcmToken,
        fcmTokenActualizadoEn: new Date()
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    res.json({
      message: "Token FCM actualizado exitosamente",
      fcmToken: fcmToken,
      actualizadoEn: user.fcmTokenActualizadoEn
    });
  } catch (error) {
    console.error('Error al actualizar FCM token:', error);
    res.status(500).json({
      message: "Error al actualizar el token FCM",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};