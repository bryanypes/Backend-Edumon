import PerfilFamiliar from '../models/PerfilFamiliar.js';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

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
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

export const getMisPerfiles = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const titular = await User.findById(titularId)
      .select('nombre avatarUrl fotoPerfilUrl fcmToken')
      .lean();

    const perfiles = await PerfilFamiliar.find({
      titularId,
      activo: true
    }).sort({ createdAt: 1 }).lean();

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
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// Genera un JWT con perfilId incluido; el frontend lo llama al elegir un perfil
// en la pantalla de selección
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
        .select('nombre apellido fotoPerfilUrl rol')
        .lean();

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

    const perfil = await PerfilFamiliar.findOne({
      _id: perfilId,
      titularId,
      activo: true
    }).lean();

    if (!perfil) {
      return res.status(404).json({
        message: 'Perfil no encontrado o no pertenece a tu cuenta'
      });
    }

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
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

export const actualizarPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { id } = req.params;
    const { nombre, avatarUrl } = req.body;

    const perfil = await PerfilFamiliar.findOneAndUpdate(
      { _id: id, titularId, activo: true },
      { nombre, avatarUrl },
      { new: true, runValidators: true }
    ).lean();

    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json({ message: 'Perfil actualizado', perfil });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// Soft delete: marca activo=false en vez de borrar el documento
export const eliminarPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { id } = req.params;

    const perfil = await PerfilFamiliar.findOneAndUpdate(
      { _id: id, titularId, activo: true },
      { activo: false },
      { new: true }
    ).lean();

    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json({ message: 'Perfil eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// El frontend llama esto cuando un perfil está activo en un dispositivo
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

    const perfil = await PerfilFamiliar.findOneAndUpdate(
      { _id: perfilId, titularId, activo: true },
      { fcmToken, fcmTokenActualizadoEn: new Date() },
      { new: true }
    ).lean();

    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json({ message: `FCM token del perfil "${perfil.nombre}" guardado` });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};