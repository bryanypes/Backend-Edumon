import PerfilFamiliar from '../models/PerfilFamiliar.js';
import User from '../models/User.js';
import { generarAccessToken, setAccessTokenCookie } from './authController.js';

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

// Reemplaza la cookie access_token por una que incluye perfilId/esTitular —
// igual patrón de sesión que login/register/refresh (httpOnly, sin exponer el
// JWT al JS del frontend). No toca el refresh token: la sesión del titular
// sigue siendo la misma, solo cambia qué perfil está activo dentro de ella.
export const seleccionarPerfil = async (req, res) => {
  try {
    const titularId = req.user.userId;
    const { perfilId } = req.body;

    const titular = await User.findById(titularId)
      .select('nombre apellido fotoPerfilUrl rol primerInicioSesion')
      .lean();
    if (!titular) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Si selecciona "titular" (perfilId = null o 'titular')
    if (!perfilId || perfilId === 'titular') {
      const accessToken = generarAccessToken(titular, { perfilId: null, esTitular: true });
      setAccessTokenCookie(res, accessToken);

      return res.json({
        message: 'Perfil titular seleccionado',
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

    const accessToken = generarAccessToken(titular, { perfilId: perfil._id, esTitular: false });
    setAccessTokenCookie(res, accessToken);

    res.json({
      message: `Perfil "${perfil.nombre}" seleccionado`,
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