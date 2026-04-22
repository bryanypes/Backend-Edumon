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
      console.error(' [getMisNotificaciones] req.user no está definido');
      console.error('   Headers:', req.headers.authorization);
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

    //  Convertir ObjectId a String
    const usuarioIdString = req.user.userId.toString();

    console.log(`\n [DEBUG getMisNotificaciones]`);
    console.log(`   Usuario autenticado: ${req.user.nombre || 'N/A'} ${req.user.apellido || ''}`);
    console.log(`   Usuario ID (ObjectId): ${req.user.userId}`);
    console.log(`   Usuario ID (String): ${usuarioIdString}`);
    console.log(`   Rol: ${req.user.rol || 'N/A'}`);
    console.log(`   Parámetros - Page: ${page}, Limit: ${limit}, Tipo: ${tipo || 'N/A'}, Leído: ${leido !== undefined ? leido : 'N/A'}`);

    //  Construir query
    const query = { usuarioId: usuarioIdString };

    if (tipo) {
      query.tipo = tipo;
    }
    
    //  Manejar correctamente el parámetro 'leido'
    if (leido !== undefined && leido !== null && leido !== '') {
      if (typeof leido === 'string') {
        query.leido = leido.toLowerCase() === 'true';
      } else {
        query.leido = Boolean(leido);
      }
    }

    console.log(`   Query construido:`, JSON.stringify(query, null, 2));

    const skip = (page - 1) * limit;

    //  Buscar notificaciones
    const [notificaciones, total] = await Promise.all([
      Notificacion.find(query)
        .sort({ fecha: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('referenciaId')
        .lean(),
      Notificacion.countDocuments(query)
    ]);

    //  Contar no leídas
    const noLeidas = await Notificacion.countDocuments({
      usuarioId: usuarioIdString,
      leido: false
    });

    console.log(`\n Resultado de búsqueda:`);
    console.log(`    Notificaciones encontradas: ${notificaciones.length}`);
    console.log(`    Total en BD: ${total}`);
    console.log(`    No leídas: ${noLeidas}`);

    //  Debug: Mostrar algunas notificaciones encontradas
    if (notificaciones.length > 0) {
      console.log(`   📝 Primeras notificaciones:`);
      notificaciones.slice(0, 3).forEach((notif, index) => {
        console.log(`      ${index + 1}. ${notif._id} - ${notif.titulo} (leído: ${notif.leido})`);
      });
    } else {
      //  Si no hay notificaciones, verificar si existen en BD
      const totalEnBD = await Notificacion.countDocuments({});
      const conEsteUsuario = await Notificacion.countDocuments({ usuarioId: usuarioIdString });
      console.log(`     Total notificaciones en BD: ${totalEnBD}`);
      console.log(`     Notificaciones para este usuario: ${conEsteUsuario}`);
      
      // Mostrar una muestra de usuarioIds en BD
      const muestraUsuarios = await Notificacion.find({}).limit(5).select('usuarioId titulo').lean();
      if (muestraUsuarios.length > 0) {
        console.log(`   🔍 Muestra de usuarioIds en BD:`);
        muestraUsuarios.forEach((n, i) => {
          console.log(`      ${i + 1}. usuarioId: "${n.usuarioId}" (tipo: ${typeof n.usuarioId}) - ${n.titulo}`);
        });
      }
    }

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
    console.error(' Error al obtener notificaciones:', error);
    console.error('   Stack:', error.stack);
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
      console.log(`  Notificación ${req.params.id} no encontrada para usuario ${usuarioIdString}`);
      return res.status(404).json({ 
        message: 'Notificación no encontrada' 
      });
    }

    console.log(` Notificación ${req.params.id} encontrada`);
    res.status(200).json(notificacion);
  } catch (error) {
    console.error(' Error al obtener notificación:', error);
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

    console.log(` Marcando como leída: ${req.params.id} para usuario ${usuarioIdString}`);

    const notificacion = await Notificacion.findOneAndUpdate(
      { 
        _id: req.params.id, 
        usuarioId: usuarioIdString
      },
      { leido: true },
      { new: true }
    );

    if (!notificacion) {
      console.log(`  Notificación ${req.params.id} no encontrada`);
      return res.status(404).json({ 
        message: 'Notificación no encontrada' 
      });
    }

    const noLeidas = await Notificacion.countDocuments({
      usuarioId: usuarioIdString,
      leido: false
    });

    console.log(` Notificación marcada como leída. No leídas restantes: ${noLeidas}`);

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

    console.log(` Marcando ${notificacionIds.length} notificaciones como leídas`);

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

    console.log(` ${resultado.modifiedCount} notificaciones marcadas. No leídas: ${noLeidas}`);

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

    console.log(` Marcando todas las notificaciones como leídas para usuario ${usuarioIdString}`);

    const resultado = await Notificacion.updateMany(
      { 
        usuarioId: usuarioIdString,
        leido: false 
      },
      { leido: true }
    );

    console.log(` ${resultado.modifiedCount} notificaciones marcadas como leídas`);

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

    console.log(`  Eliminando notificación ${req.params.id} de usuario ${usuarioIdString}`);

    const notificacion = await Notificacion.findOneAndDelete({
      _id: req.params.id,
      usuarioId: usuarioIdString
    });

    if (!notificacion) {
      console.log(`  Notificación ${req.params.id} no encontrada`);
      return res.status(404).json({ 
        message: 'Notificación no encontrada' 
      });
    }

    const noLeidas = await Notificacion.countDocuments({
      usuarioId: usuarioIdString,
      leido: false
    });

    console.log(` Notificación eliminada. No leídas restantes: ${noLeidas}`);

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

    console.log(`  Eliminando notificaciones leídas anteriores a ${fechaLimite.toISOString()}`);

    const resultado = await Notificacion.deleteMany({
      usuarioId: usuarioIdString,
      leido: true,
      fecha: { $lt: fechaLimite }
    });

    console.log(` ${resultado.deletedCount} notificaciones antiguas eliminadas`);

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

    console.log(` Usuario ${usuarioIdString} tiene ${noLeidas} notificaciones no leídas`);

    res.status(200).json({ noLeidas });
  } catch (error) {
    console.error(' Error al obtener conteo:', error);
    res.status(500).json({ 
      message: 'Error al obtener el conteo', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};