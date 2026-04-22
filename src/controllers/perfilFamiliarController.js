import PerfilFamiliar from '../models/PerfilFamiliar.js';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

/**
 * Crear perfil familiar
 * Solo el titular puede crear perfiles bajo su cuenta
 */
export const crearPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { nombre, avatarUrl } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    // Máximo 5 perfiles por titular
    const totalPerfiles = await PerfilFamiliar.countDocuments({
      titularId,
      activo: true
    });

    if (totalPerfiles >= 5) {
      return res.status(400).json({
        message: 'Máximo 5 perfiles por cuenta'
      });
    }

    const perfil = new PerfilFamiliar({
      titularId,
      nombre,
      avatarUrl: avatarUrl || null
    });

    await perfil.save();

    res.status(201).json({
      message: 'Perfil creado exitosamente',
      perfil
    });
  } catch (error) {
    console.error('[crearPerfil]', error);
    res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * Obtener perfiles del titular autenticado
 */
export const getMisPerfiles = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const titular = await User.findById(titularId)
      .select('nombre avatarUrl fotoPerfilUrl fcmToken');

    const perfiles = await PerfilFamiliar.find({
      titularId,
      activo: true
    }).sort({ createdAt: 1 });

    res.json({
      // El titular aparece primero como perfil principal
      titular: {
        _id: titular._id,
        nombre: titular.nombre,
        avatarUrl: titular.fotoPerfilUrl,
        esTitular: true
      },
      perfiles
    });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * Seleccionar perfil — genera un JWT con perfilId incluido
 * El frontend llama esto cuando el usuario elige un perfil en la pantalla de selección
 */
export const seleccionarPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { perfilId } = req.body;

    // Si selecciona "titular" (perfilId = null o 'titular')
    if (!perfilId || perfilId === 'titular') {
      const token = jwt.sign(
        {
          userId: titularId,
          perfilId: null,
          esTitular: true
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      const titular = await User.findById(titularId)
        .select('nombre apellido fotoPerfilUrl rol');

      return res.json({
        message: 'Perfil titular seleccionado',
        token,
        perfil: {
          _id: titularId,
          nombre: titular.nombre,
          avatarUrl: titular.fotoPerfilUrl,
          esTitular: true
        }
      });
    }

    // Verificar que el perfil pertenece al titular
    const perfil = await PerfilFamiliar.findOne({
      _id: perfilId,
      titularId,
      activo: true
    });

    if (!perfil) {
      return res.status(404).json({
        message: 'Perfil no encontrado o no pertenece a tu cuenta'
      });
    }

    // Generar token con perfilId incluido
    const token = jwt.sign(
      {
        userId: titularId,   // sigue siendo el titular (para permisos y datos)
        perfilId: perfil._id, // identifica qué perfil está activo
        esTitular: false
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: `Perfil "${perfil.nombre}" seleccionado`,
      token,
      perfil: {
        _id: perfil._id,
        nombre: perfil.nombre,
        avatarUrl: perfil.avatarUrl,
        esTitular: false
      }
    });
  } catch (error) {
    console.error('[seleccionarPerfil]', error);
    res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * Actualizar perfil (nombre o avatar)
 */
export const actualizarPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { id } = req.params;
    const { nombre, avatarUrl } = req.body;

    const perfil = await PerfilFamiliar.findOneAndUpdate(
      { _id: id, titularId, activo: true },
      { nombre, avatarUrl },
      { new: true, runValidators: true }
    );

    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json({ message: 'Perfil actualizado', perfil });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * Eliminar perfil (soft delete)
 */
export const eliminarPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { id } = req.params;

    const perfil = await PerfilFamiliar.findOneAndUpdate(
      { _id: id, titularId, activo: true },
      { activo: false },
      { new: true }
    );

    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json({ message: 'Perfil eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * Guardar FCM token de un perfil específico
 * El frontend llama esto cuando un perfil está activo en un dispositivo
 */
export const guardarFCMTokenPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { perfilId, fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: 'fcmToken requerido' });
    }

    // Si es el perfil titular
    if (!perfilId || perfilId === 'titular') {
      await User.findByIdAndUpdate(titularId, {
        fcmToken,
        fcmTokenActualizadoEn: new Date()
      });
      return res.json({ message: 'FCM token del titular guardado' });
    }

    // Si es un perfil adicional
    const perfil = await PerfilFamiliar.findOneAndUpdate(
      { _id: perfilId, titularId, activo: true },
      { fcmToken, fcmTokenActualizadoEn: new Date() },
      { new: true }
    );

    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json({ message: `FCM token del perfil "${perfil.nombre}" guardado` });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: error.message });
  }
};