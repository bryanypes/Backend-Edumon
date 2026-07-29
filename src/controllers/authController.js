import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { enviarCorreoRecuperacion } from '../services/mailService.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';

const AVATAR_PREDETERMINADO =
  'https://res.cloudinary.com/djvilfslm/image/upload/v1761514239/fotos-perfil-predeterminadas/avatar1.webp';

const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Duraciones ───────────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días en ms

// ─── Cookie base compartida ───────────────────────────────────────────────────
const COOKIE_BASE = {
  httpOnly: true,
  secure:   IS_PROD,           // solo HTTPS en producción — SameSite=None exige Secure
  // 'none' en prod: el frontend (web/Flutter web) vive en un origen distinto al backend
  // (ej. Render), así que la cookie es cross-site. 'strict'/'lax' hacen que el navegador
  // NUNCA la reenvíe en ese caso — el login "funciona" pero toda petición protegida
  // siguiente llega sin cookie y cae en 401.
  sameSite: IS_PROD ? 'none' : 'lax',
  path:     '/',
};

// ─── Helpers de token ─────────────────────────────────────────────────────────

// `perfilId`/`esTitular` identifican qué perfil familiar está activo (ver
// seleccionarPerfil en perfilFamiliarController.js); por defecto es el titular.
export const generarAccessToken = (user, { perfilId = null, esTitular = true } = {}) =>
  jwt.sign(
    {
      userId:            user._id,
      rol:               user.rol,
      primerInicioSesion: user.primerInicioSesion ?? false,
      perfilId,
      esTitular,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );

// Genera un refresh token opaco; se guarda solo el hash en BD
const generarRefreshToken = () => {
  const raw  = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
};

// Exportado para que otros controladores (ej. seleccionarPerfil) puedan renovar
// solo el access token sin tocar el refresh token / la sesión de login.
export const setAccessTokenCookie = (res, accessToken) => {
  // Access token: expira cuando cierra el browser o en 15 min
  res.cookie('access_token', accessToken, {
    ...COOKIE_BASE,
    maxAge: 15 * 60 * 1000,
  });
};

const setSessionCookies = (res, accessToken, refreshToken) => {
  setAccessTokenCookie(res, accessToken);

  // Refresh token: persiste 7 días
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_BASE,
    path:   '/api/auth/refresh', // solo accesible desde ese endpoint
    maxAge: REFRESH_TOKEN_TTL,
  });
};

const clearSessionCookies = (res) => {
  res.clearCookie('access_token',  { ...COOKIE_BASE });
  res.clearCookie('refresh_token', { ...COOKIE_BASE, path: '/api/auth/refresh' });
};

/** Extrae el access token desde cookie o header (compatibilidad transitoria) */
export const extractAccessToken = (req) => {
  if (req.cookies?.access_token) return req.cookies.access_token;
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) return header.split(' ')[1];
  return null;
};

// ─── Datos públicos de usuario ────────────────────────────────────────────────
const publicUser = (user) => ({
  id:                 user._id,
  nombre:             user.nombre,
  apellido:           user.apellido,
  cedula:             user.cedula,
  correo:             user.correo,
  rol:                user.rol,
  telefono:           user.telefono,
  estado:             user.estado,
  ultimoAcceso:       user.ultimoAcceso,
  institucionId:      user.institucionId,
  fotoPerfilUrl:      user.fotoPerfilUrl,
  primerInicioSesion: user.primerInicioSesion,
});

// ─── REGISTER ─────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });

    const { nombre, apellido, cedula, correo, contraseña, rol, telefono, institucionId } = req.body;

    const telefonoNormalizado = normalizarTelefono(telefono);
    if (telefono && !telefonoNormalizado)
      return res.status(400).json({ message: 'El número de teléfono no es válido' });

    const existingCedula = await User.findOne({ cedula });
    if (existingCedula)
      return res.status(409).json({ message: 'Ya existe un usuario con esta cédula' });

    const existingUser = await User.findOne({
      $or: [
        ...(correo              ? [{ correo }]                            : []),
        ...(telefonoNormalizado ? [{ telefono: telefonoNormalizado }]     : []),
      ],
    });
    if (existingUser) {
      const field = existingUser.correo === correo ? 'correo' : 'teléfono';
      return res.status(409).json({ message: `Ya existe un usuario con este ${field}` });
    }

    let institucionFinal = null;
    if (rol === 'docente' || rol === 'administrador') institucionFinal = institucionId || null;

    const newUser = new User({
      nombre, apellido, cedula, correo, contraseña, rol,
      telefono:     telefonoNormalizado,
      institucionId: institucionFinal,
      fechaRegistro: new Date(),
      fotoPerfilUrl: AVATAR_PREDETERMINADO,
    });

    const savedUser = await newUser.save();

    // Emitir sesión completa igual que en login
    const accessToken    = generarAccessToken(savedUser);
    const { raw, hash }  = generarRefreshToken();
    const expiraEn       = new Date(Date.now() + REFRESH_TOKEN_TTL);

    // refreshTokens tiene select:false en el schema, pero savedUser es el mismo
    // documento recién creado en memoria, así que ya lo trae sin necesidad de recargarlo
    savedUser.refreshTokens.push({
      tokenHash: hash,
      expiraEn,
      userAgent: req.headers['user-agent'] || '',
      ip:        req.ip || '',
    });
    await savedUser.save();

    setSessionCookies(res, accessToken, raw);
    eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, savedUser);

    return res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user:    publicUser(savedUser),
    });
  } catch (error) {
    console.error('Error en registro:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });

    const { telefono, contraseña } = req.body;

    const telefonoNormalizado = normalizarTelefono(telefono);
    if (!telefonoNormalizado)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    const user = await User.findOne({ telefono: telefonoNormalizado }).select('+refreshTokens');
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
    if (user.estado !== 'activo')
      return res.status(401).json({ message: 'Usuario suspendido. Contacte al administrador.' });

    const isPasswordValid = await user.comparePassword(contraseña);
    if (!isPasswordValid) return res.status(401).json({ message: 'Credenciales inválidas' });

    const esPrimerInicio = user.primerInicioSesion;
    user.ultimoAcceso    = new Date();

    // Limpiar refresh tokens expirados antes de agregar uno nuevo
    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.expiraEn > new Date(),
    );

    // Máximo 5 sesiones simultáneas: eliminar la más antigua si se supera
    if (user.refreshTokens.length >= 5) {
      user.refreshTokens.sort((a, b) => a.creadoEn - b.creadoEn);
      user.refreshTokens.shift();
    }

    const accessToken   = generarAccessToken(user);
    const { raw, hash } = generarRefreshToken();
    const expiraEn      = new Date(Date.now() + REFRESH_TOKEN_TTL);

    user.refreshTokens.push({
      tokenHash: hash,
      expiraEn,
      userAgent: req.headers['user-agent'] || '',
      ip:        req.ip || '',
    });

    await user.save();
    setSessionCookies(res, accessToken, raw);

    return res.json({
      message:            'Login exitoso',
      primerInicioSesion: esPrimerInicio,
      user:               publicUser(user),
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── REFRESH ──────────────────────────────────────────────────────────────────
export const refresh = async (req, res) => {
  try {
    const rawToken = req.cookies?.refresh_token;
    if (!rawToken)
      return res.status(401).json({ message: 'Refresh token requerido' });

    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Buscar usuario que tenga ese hash y no esté expirado
    const user = await User.findOne({
      'refreshTokens.tokenHash': hash,
      'refreshTokens.expiraEn':  { $gt: new Date() },
    }).select('+refreshTokens');

    if (!user || user.estado !== 'activo') {
      clearSessionCookies(res);
      return res.status(401).json({ message: 'Sesión inválida o expirada' });
    }

    // ─── Rotación: invalida el token usado y emite uno nuevo ─────────────
    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.tokenHash !== hash && t.expiraEn > new Date(),
    );

    const accessToken      = generarAccessToken(user);
    const { raw, hash: newHash } = generarRefreshToken();
    const expiraEn         = new Date(Date.now() + REFRESH_TOKEN_TTL);

    user.refreshTokens.push({
      tokenHash: newHash,
      expiraEn,
      userAgent: req.headers['user-agent'] || '',
      ip:        req.ip || '',
    });

    await user.save();
    setSessionCookies(res, accessToken, raw);

    return res.json({ message: 'Token renovado' });
  } catch (error) {
    console.error('Error en refresh:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    const rawToken = req.cookies?.refresh_token;

    if (rawToken) {
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
      // Invalida solo esta sesión (no todas)
      await User.findByIdAndUpdate(req.user.userId, {
        $pull: { refreshTokens: { tokenHash: hash } },
      });
    }

    clearSessionCookies(res);
    return res.json({ message: 'Logout exitoso' });
  } catch (error) {
    console.error('Error en logout:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── LOGOUT ALL (cerrar todas las sesiones) ───────────────────────────────────
export const logoutAll = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, { $set: { refreshTokens: [] } });
    clearSessionCookies(res);
    return res.json({ message: 'Todas las sesiones cerradas' });
  } catch (error) {
    console.error('Error en logoutAll:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── PROFILE ──────────────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    return res.json({
      user: {
        ...publicUser(user),
        fechaRegistro: user.fechaRegistro,
        preferencias:  user.preferencias,
      },
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });

    const { contraseñaActual, contraseñaNueva } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isCurrentPasswordValid = await user.comparePassword(contraseñaActual);
    if (!isCurrentPasswordValid)
      return res.status(400).json({ message: 'La contraseña actual es incorrecta' });

    user.contraseña         = contraseñaNueva;
    user.primerInicioSesion = false;
    await user.save();

    return res.json({ message: 'Contraseña cambiada exitosamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── FORGOT PASSWORD (correo) ─────────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });

    const { correo } = req.body;
    const user       = await User.findOne({ correo });

    // Respuesta genérica siempre (anti-enumeración)
    const RESPUESTA_GENERICA = {
      message: 'Si el correo está registrado, recibirás un código de recuperación.',
    };

    if (!user) return res.status(200).json(RESPUESTA_GENERICA);

    const codigo     = Math.floor(100000 + Math.random() * 900000).toString();
    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    user.resetPasswordToken   = codigoHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await enviarCorreoRecuperacion({ correo: user.correo, nombre: user.nombre }, codigo);

    return res.status(200).json(RESPUESTA_GENERICA);
  } catch (error) {
    console.error('Error en forgotPassword:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── FORGOT PASSWORD (teléfono) ───────────────────────────────────────────────
export const forgotPasswordPhone = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });

    const { telefono }          = req.body;
    const RESPUESTA_GENERICA    = {
      message: 'Si el número está registrado, recibirás un código de recuperación por WhatsApp.',
    };

    const telefonoNormalizado = normalizarTelefono(telefono);
    if (!telefonoNormalizado) return res.status(200).json(RESPUESTA_GENERICA);

    const user = await User.findOne({ telefono: telefonoNormalizado });
    if (!user) return res.status(200).json(RESPUESTA_GENERICA);

    const codigo     = Math.floor(100000 + Math.random() * 900000).toString();
    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    user.resetPasswordToken   = codigoHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await enviarSMSRecuperacion(telefonoNormalizado, user.nombre, codigo);

    return res.status(200).json(RESPUESTA_GENERICA);
  } catch (error) {
    console.error('Error en forgotPasswordPhone:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── RESET PASSWORD (correo) ──────────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });

    const { correo, codigo, contraseñaNueva } = req.body;
    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    const user = await User.findOne({
      correo,
      resetPasswordToken:   codigoHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ message: 'Código inválido o expirado.' });

    user.contraseña           = contraseñaNueva;
    user.resetPasswordToken   = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── RESET PASSWORD (teléfono) ────────────────────────────────────────────────
export const resetPasswordPhone = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });

    const { telefono, codigo, contraseñaNueva } = req.body;

    const telefonoNormalizado = normalizarTelefono(telefono);
    if (!telefonoNormalizado)
      return res.status(400).json({ message: 'Código inválido o expirado.' });

    const codigoHash = crypto.createHash('sha256').update(codigo).digest('hex');

    const user = await User.findOne({
      telefono:             telefonoNormalizado,
      resetPasswordToken:   codigoHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ message: 'Código inválido o expirado.' });

    user.contraseña           = contraseñaNueva;
    user.resetPasswordToken   = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
  } catch (error) {
    console.error('Error en resetPasswordPhone:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ─── Utilidad interna: WhatsApp SMS ──────────────────────────────────────────
async function enviarSMSRecuperacion(telefonoNormalizado, nombre, codigo) {
  const twilio = (await import('twilio')).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const mensaje =
    `🔐 Edumon\n\nHola ${nombre}, tu código de recuperación es:\n\n*${codigo}*\n\nExpira en 15 minutos. Si no lo solicitaste, ignora este mensaje.`;

  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to:   `whatsapp:${telefonoNormalizado}`,
    body: mensaje,
  });
}