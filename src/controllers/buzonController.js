import Buzon from '../models/Buzon.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { eventBus, EVENTOS } from '../events/EventBus.js';

export const enviarMensaje = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Errores de validación',
        errors: errors.array()
      });
    }

    const { nombre, correo, telefono, mensaje } = req.body;

    const nuevoMensaje = await Buzon.create({ nombre, correo, telefono, mensaje });

    // Notificar al superadmin
    const superadmin = await User.findOne({ rol: 'superadmin' }).select('_id correo nombre').lean();
    if (superadmin) {
      eventBus.publicar(EVENTOS.BUZON_MENSAJE_RECIBIDO, {
        destinatario: superadmin,
        mensaje: nuevoMensaje
      });
    }

    res.status(201).json({
      success: true,
      message: 'Mensaje enviado exitosamente. Nos pondremos en contacto contigo pronto.'
    });

  } catch (error) {
    console.error('Error al enviar mensaje al buzón:', error);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
};

export const obtenerMensajes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    const { leido } = req.query;

    const filter = {};
    if (leido !== undefined) filter.leido = leido === 'true';

    const [mensajes, total] = await Promise.all([
      Buzon.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Buzon.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      mensajes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error al obtener mensajes del buzón:', error);
    res.status(500).json({ error: 'Error al obtener los mensajes' });
  }
};

export const marcarLeido = async (req, res) => {
  try {
    const { id } = req.params;

    const mensaje = await Buzon.findByIdAndUpdate(
      id,
      { leido: true },
      { new: true }
    );

    if (!mensaje) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    res.status(200).json({ success: true, mensaje });

  } catch (error) {
    console.error('Error al marcar mensaje como leído:', error);
    res.status(500).json({ error: 'Error al actualizar el mensaje' });
  }
};