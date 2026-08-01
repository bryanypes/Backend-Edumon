import Notificacion from '../models/Notificacion.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { 
  enviarFCM,
  enviarWhatsApp, 
  enviarEmail 
} from '../services/notificacionService.js';
import { emitirNotificacion } from '../socket/socketHandlers.js';

// Crear notificación (uso interno principalmente)
export const createNotificacion = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const notificacion = new Notificacion(req.body);
    await notificacion.save();

    // Emitir por WebSocket
    await emitirNotificacion(notificacion);

    res.status(201).json({
      message: 'Notificación creada exitosamente',
      notificacion
    });
  } catch (error) {
    console.error('❌ Error al crear notificación:', error);
    res.status(500).json({ 
      message: 'Error al crear la notificación', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obtener notificaciones del usuario autenticado
export const getMisNotificaciones = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        message: 'Usuario no autenticado',
        error: 'Token inválido o middleware de autenticación no configurado'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      tipo,
      leido
    } = req.query;

    const usuarioIdString = req.user.userId.toString();

    const query = { usuarioId: usuarioIdString };

    if (tipo) {
      query.tipo = tipo;
    }

    if (leido !== undefined && leido !== null && leido !== '') {
      if (typeof leido === 'string') {
        query.leido = leido.toLowerCase() === 'true';
      } else {
        query.leido = Boolean(leido);
      }
    }

    const skip = (page - 1) * limit;

    const [notificaciones, total, noLeidas] = await Promise.all([
      Notificacion.find(query)
        .sort({ fecha: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('referenciaId')
        .lean(),
      Notificacion.countDocuments(query),
      Notificacion.countDocuments({ usuarioId: usuarioIdString, leido: false })
    ]);

    res.status(200).json({
      notificaciones,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      },
      noLeidas
    });
  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    res.status(500).json({
      message: 'Error al obtener las notificaciones',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//  Obtener notificación por ID
export const getNotificacionById = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const usuarioIdString = req.user.userId.toString();

    const notificacion = await Notificacion.findOne({
      _id: req.params.id,
      usuarioId: usuarioIdString
    }).populate('referenciaId');

    if (!notificacion) {
      return res.status(404).json({
        message: 'Notificación no encontrada'
      });
    }

    res.status(200).json(notificacion);
  } catch (error) {
    console.error('Error al obtener notificación:', error);
    res.status(500).json({ 
      message: 'Error al obtener la notificación', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//  Marcar notificación como leída
export const marcarComoLeida = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const usuarioIdString = req.user.userId.toString();

    const notificacion = await Notificacion.findOneAndUpdate(
      {
        _id: req.params.id,
        usuarioId: usuarioIdString
      },
      { leido: true },
      { new: true }
    );

    if (!notificacion) {
      return res.status(404).json({
        message: 'Notificación no encontrada'
      });
    }

    const noLeidas = await Notificacion.countDocuments({
      usuarioId: usuarioIdString,
      leido: false
    });

    res.status(200).json({
      message: 'Notificación marcada como leída',
      notificacion,
      noLeidas
    });
  } catch (error) {
    console.error('❌ Error al marcar notificación:', error);
    res.status(500).json({ 
      message: 'Error al actualizar la notificación', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Marcar múltiples notificaciones como leídas
export const marcarVariasLeidas = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { notificacionIds } = req.body;
    const usuarioIdString = req.user.userId.toString();

    if (!Array.isArray(notificacionIds) || notificacionIds.length === 0) {
      return res.status(400).json({ message: 'Debes enviar una lista de notificaciones' });
    }

    const resultado = await Notificacion.updateMany(
      {
        _id: { $in: notificacionIds },
        usuarioId: usuarioIdString
      },
      { leido: true }
    );

    const noLeidas = await Notificacion.countDocuments({
      usuarioId: usuarioIdString,
      leido: false
    });

    res.status(200).json({
      message: 'Notificaciones marcadas como leídas',
      modificadas: resultado.modifiedCount,
      noLeidas
    });
  } catch (error) {
    console.error(' Error al marcar notificaciones:', error);
    res.status(500).json({ 
      message: 'Error al actualizar las notificaciones', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//  Marcar todas como leídas
export const marcarTodasLeidas = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const usuarioIdString = req.user.userId.toString();

    const resultado = await Notificacion.updateMany(
      {
        usuarioId: usuarioIdString,
        leido: false
      },
      { leido: true }
    );

    res.status(200).json({
      message: 'Todas las notificaciones marcadas como leídas',
      modificadas: resultado.modifiedCount,
      noLeidas: 0
    });
  } catch (error) {
    console.error('❌ Error al marcar todas las notificaciones:', error);
    res.status(500).json({ 
      message: 'Error al actualizar las notificaciones', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//  Eliminar notificación
export const deleteNotificacion = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const usuarioIdString = req.user.userId.toString();

    const notificacion = await Notificacion.findOneAndDelete({
      _id: req.params.id,
      usuarioId: usuarioIdString
    });

    if (!notificacion) {
      return res.status(404).json({
        message: 'Notificación no encontrada'
      });
    }

    const noLeidas = await Notificacion.countDocuments({
      usuarioId: usuarioIdString,
      leido: false
    });

    res.status(200).json({
      message: 'Notificación eliminada exitosamente',
      noLeidas
    });
  } catch (error) {
    console.error('❌ Error al eliminar notificación:', error);
    res.status(500).json({ 
      message: 'Error al eliminar la notificación', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//  Eliminar todas las notificaciones leídas antiguas
export const eliminarLeidasAntiguas = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const { dias = 30 } = req.query;
    const usuarioIdString = req.user.userId.toString();
    
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - parseInt(dias));

    const resultado = await Notificacion.deleteMany({
      usuarioId: usuarioIdString,
      leido: true,
      fecha: { $lt: fechaLimite }
    });

    res.status(200).json({
      message: `${resultado.deletedCount} notificaciones antiguas eliminadas`,
      eliminadas: resultado.deletedCount
    });
  } catch (error) {
    console.error(' Error al eliminar notificaciones antiguas:', error);
    res.status(500).json({ 
      message: 'Error al eliminar notificaciones', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obtener conteo de no leídas
export const getConteoNoLeidas = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const usuarioIdString = req.user.userId.toString();

    const noLeidas = await Notificacion.countDocuments({
      usuarioId: usuarioIdString,
      leido: false
    });

    res.status(200).json({ noLeidas });
  } catch (error) {
    console.error('Error al obtener conteo:', error);
    res.status(500).json({ 
      message: 'Error al obtener el conteo', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};