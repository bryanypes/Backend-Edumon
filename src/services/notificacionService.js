// src/services/notificacionService.js
import axios from 'axios';
import mongoose from 'mongoose';
import Notificacion from '../models/Notificacion.js';
import User from '../models/User.js';
import twilio from 'twilio';
import admin from 'firebase-admin';
import { emitirNotificacion } from '../socket/socketHandlers.js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

// ─────────────────────────────────────────────
// INICIALIZACIÓN FIREBASE ADMIN
// Solo inicializa una vez
// ─────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Las \n deben ser reales en la clave privada
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

// ─────────────────────────────────────────────
// TWILIO (WhatsApp)
// ─────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ─────────────────────────────────────────────
// CORE: Crear y enviar notificación a UN usuario
// ─────────────────────────────────────────────
export const crearYEnviarNotificacion = async (datos) => {
  try {
    const {
      usuarioId,
      tipo,
      mensaje,
      prioridad = 'critica',
      referenciaId,
      referenciaModelo,
      metadata = {}
    } = datos;

    const usuario = await User.findById(usuarioId);
    if (!usuario) throw new Error(`Usuario no encontrado: ${usuarioId}`);

    // Guardar en BD
    const notificacion = new Notificacion({
      usuarioId,
      tipo,
      mensaje,
      prioridad,
      referenciaId,
      referenciaModelo,
      metadata
    });
    await notificacion.save();

    // WebSocket
    try {
      await emitirNotificacion(notificacion);
      notificacion.canalEnviado.websocket = true;
    } catch (e) {
      console.error('[WS Error]', e.message);
    }

    // FCM Push
    if (usuario.fcmToken) {
      try {
        await enviarFCM(usuario.fcmToken, {
          title: obtenerTitulo(tipo),
          body: mensaje,
          data: {
            notificacionId: notificacion._id.toString(),
            tipo,
            url: obtenerUrl(notificacion)
          }
        });
        notificacion.canalEnviado.push = true;
      } catch (e) {
        console.error('[FCM Error]', e.message);
        // Si el token expiró, limpiarlo
        if (e.code === 'messaging/registration-token-not-registered') {
          await User.findByIdAndUpdate(usuarioId, { fcmToken: null });
        }
      }
    }

    // Email
    if (usuario.correo) {
      try {
        await enviarEmail(usuario, notificacion);
        notificacion.canalEnviado.email = true;
      } catch (e) {
        console.error('[Email Error]', e.message);
      }
    }

    // WhatsApp
    if (usuario.telefono) {
      try {
        await enviarWhatsApp(usuario, notificacion);
        notificacion.canalEnviado.whatsapp = true;
      } catch (e) {
        console.error('[WhatsApp Error]', e.message);
      }
    }

    await notificacion.save();
    return notificacion;

  } catch (error) {
    console.error('[crearYEnviarNotificacion] ERROR:', error.message);
    throw error;
  }
};

// ─────────────────────────────────────────────
// CORE: Notificar a TODA UNA FAMILIA
// Este es el método central del bloque familiar
// ─────────────────────────────────────────────
export const notificarFamilia = async (usuarioId, datos) => {
  try {
    // Buscar la familia del usuario
    const familia = await FamiliaBloque.encontrarPorMiembro(usuarioId);

    if (!familia) {
      // Si no tiene familia, notificar solo al usuario
      console.log(`[FAMILIA] Usuario ${usuarioId} sin bloque familiar, notificando solo a él`);
      return await crearYEnviarNotificacion({ ...datos, usuarioId });
    }

    const miembros = familia.obtenerMiembrosActivos();
    console.log(`[FAMILIA] Notificando a ${miembros.length} miembros del bloque "${familia.nombre}"`);

    const promesas = miembros.map(miembroId =>
      crearYEnviarNotificacion({ ...datos, usuarioId: miembroId })
        .catch(e => console.error(`[FAMILIA] Error notificando a ${miembroId}:`, e.message))
    );

    await Promise.allSettled(promesas);
  } catch (error) {
    console.error('[notificarFamilia] ERROR:', error.message);
  }
};

// ─────────────────────────────────────────────
// FCM: Enviar push via Firebase
// ─────────────────────────────────────────────
export const enviarFCM = async (fcmToken, { title, body, data = {} }) => {
  const message = {
    token: fcmToken,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: {
        icon: 'ic_notification',
        color: '#00B9F0',
        sound: 'default'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    },
    webpush: {
      notification: {
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        requireInteraction: true
      }
    }
  };

  const response = await admin.messaging().send(message);
  console.log(`[FCM] Enviado exitosamente: ${response}`);
  return response;
};

// ─────────────────────────────────────────────
// FCM: Enviar a múltiples tokens (batch)
// ─────────────────────────────────────────────
export const enviarFCMMultiple = async (fcmTokens, payload) => {
  if (!fcmTokens || fcmTokens.length === 0) return;

  // FCM permite hasta 500 tokens por batch
  const chunks = [];
  for (let i = 0; i < fcmTokens.length; i += 500) {
    chunks.push(fcmTokens.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const message = {
      tokens: chunk,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: Object.fromEntries(
        Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
      )
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM Batch] Éxito: ${response.successCount}, Fallos: ${response.failureCount}`);

    // Limpiar tokens inválidos
    response.responses.forEach(async (resp, idx) => {
      if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
        await User.findOneAndUpdate(
          { fcmToken: chunk[idx] },
          { fcmToken: null }
        );
      }
    });
  }
};

// ─────────────────────────────────────────────
// WhatsApp
// ─────────────────────────────────────────────
export const enviarWhatsApp = async (usuario, notificacion) => {
  if (!usuario.telefono) return;

  const mensaje = `🔔 *${obtenerTitulo(notificacion.tipo)}*\n\n${notificacion.mensaje}\n\n_Notificación de Edumon_`;

  await twilioClient.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${usuario.telefono}`,
    body: mensaje
  });
};

// ─────────────────────────────────────────────
// Email (MailerSend)
// ─────────────────────────────────────────────
export const enviarEmail = async (usuario, notificacion) => {
  if (!process.env.MAILERSEND_API_KEY || !process.env.MAILERSEND_FROM_EMAIL) {
    throw new Error('MailerSend no configurado');
  }

  await axios.post(
    'https://api.mailersend.com/v1/email',
    {
      from: { email: process.env.MAILERSEND_FROM_EMAIL, name: 'Edumon' },
      to: [{ email: usuario.correo, name: `${usuario.nombre} ${usuario.apellido}` }],
      subject: obtenerTitulo(notificacion.tipo),
      html: generarHTMLEmail(usuario, notificacion)
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
};

// ─────────────────────────────────────────────
// EVENTOS DE DOMINIO
// Cada función determina a quién notificar y llama
// crearYEnviarNotificacion o notificarFamilia
// ─────────────────────────────────────────────

/**
 * Nueva tarea — notifica a los padres destinatarios
 * y a TODOS los miembros de sus familias
 */
export const notificarNuevaTarea = async (tarea) => {
  try {
    const Curso = (await import('../models/Curso.js')).default;

    let curso = tarea.cursoId?.participantes
      ? tarea.cursoId
      : await Curso.findById(tarea.cursoId).populate({
          path: 'participantes.usuarioId',
          select: 'nombre apellido correo telefono fcmToken familiaId'
        });

    if (!curso) { console.error('[notificarNuevaTarea] Curso no encontrado'); return; }

    let destinatarios = await resolverDestinatarios(tarea, curso);
    if (destinatarios.length === 0) return;

    const fechaFormateada = new Date(tarea.fechaEntrega).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const datos = {
      tipo: 'tarea',
      mensaje: `Nueva tarea: "${tarea.titulo}". Entrega: ${fechaFormateada}`,
      prioridad: 'critica',
      referenciaId: tarea._id,
      referenciaModelo: 'Tarea',
      metadata: {
        cursoNombre: curso.nombre,
        tareaTitulo: tarea.titulo,
        fechaEntrega: tarea.fechaEntrega
      }
    };

    // notificarFamilia se encarga de expandir al bloque completo
    await Promise.allSettled(
      destinatarios.map(u => notificarFamilia(u._id, datos))
    );

    console.log(`[notificarNuevaTarea] Completado para ${destinatarios.length} padre(s)`);
  } catch (error) {
    console.error('[notificarNuevaTarea]', error);
  }
};

/**
 * Tarea cerrada
 */
export const notificarTareaCerrada = async (tarea) => {
  try {
    const Curso = (await import('../models/Curso.js')).default;
    let curso = tarea.cursoId?.participantes
      ? tarea.cursoId
      : await Curso.findById(tarea.cursoId).populate({
          path: 'participantes.usuarioId',
          select: 'nombre apellido correo telefono fcmToken familiaId'
        });

    if (!curso) return;

    const destinatarios = await resolverDestinatarios(tarea, curso);
    const datos = {
      tipo: 'tarea',
      mensaje: `La tarea "${tarea.titulo}" ha sido cerrada. Ya no se aceptan entregas.`,
      prioridad: 'critica',
      referenciaId: tarea._id,
      referenciaModelo: 'Tarea',
      metadata: { cursoNombre: curso.nombre, tareaTitulo: tarea.titulo }
    };

    await Promise.allSettled(
      destinatarios.map(u => notificarFamilia(u._id, datos))
    );
  } catch (error) {
    console.error('[notificarTareaCerrada]', error);
  }
};

/**
 * Nueva entrega — notifica al docente
 */
export const notificarNuevaEntrega = async (entrega) => {
  try {
    if (!entrega.tareaId?.docenteId || !entrega.padreId) return;

    const tarea = entrega.tareaId;
    const docente = tarea.docenteId;
    const padre = entrega.padreId;

    await crearYEnviarNotificacion({
      usuarioId: docente._id,
      tipo: 'entrega',
      mensaje: `${padre.nombre} ${padre.apellido} entregó "${tarea.titulo}". Ya puedes calificarla.`,
      prioridad: 'critica',
      referenciaId: entrega._id,
      referenciaModelo: 'Entrega',
      metadata: { tareaTitulo: tarea.titulo, padreNombre: `${padre.nombre} ${padre.apellido}` }
    });
  } catch (error) {
    console.error('[notificarNuevaEntrega]', error);
  }
};

/**
 * Calificación — notifica al padre y su bloque familiar
 */
export const notificarCalificacion = async (entrega) => {
  try {
    const [Tarea, User] = await Promise.all([
      import('../models/Tarea.js').then(m => m.default),
      import('../models/User.js').then(m => m.default)
    ]);

    const [tarea, padre, docente] = await Promise.all([
      Tarea.findById(entrega.tareaId),
      User.findById(entrega.padreId),
      User.findById(entrega.calificacion.docenteId)
    ]);

    if (!tarea || !padre || !docente) return;

    const datos = {
      tipo: 'calificacion',
      mensaje: `"${tarea.titulo}" calificada por ${docente.nombre} ${docente.apellido}. Nota: ${entrega.calificacion.nota}/100`,
      prioridad: 'critica',
      referenciaId: entrega._id,
      referenciaModelo: 'Entrega',
      metadata: {
        tareaTitulo: tarea.titulo,
        nota: entrega.calificacion.nota,
        comentario: entrega.calificacion.comentario
      }
    };

    // Notificar al bloque familiar del padre
    await notificarFamilia(padre._id, datos);
  } catch (error) {
    console.error('[notificarCalificacion]', error);
  }
};

/**
 * Tarea próxima a vencer — solo a quienes no han entregado
 */
export const notificarTareaProximaVencer = async (tarea) => {
  try {
    const [Curso, Entrega, User] = await Promise.all([
      import('../models/Curso.js').then(m => m.default),
      import('../models/Entrega.js').then(m => m.default),
      import('../models/User.js').then(m => m.default)
    ]);

    const [curso, entregasRealizadas] = await Promise.all([
      Curso.findById(tarea.cursoId).populate({
        path: 'participantes.usuarioId',
        select: 'nombre apellido correo telefono fcmToken'
      }),
      Entrega.find({
        tareaId: tarea._id,
        estado: { $in: ['enviada', 'tarde'] }
      }).distinct('padreId')
    ]);

    if (!curso) return;

    let destinatarios = [];
    const yaEntregaron = new Set(entregasRealizadas.map(id => id.toString()));

    if (tarea.asignacionTipo === 'todos') {
      destinatarios = curso.participantes
        .filter(p => p.usuarioId && p.etiqueta === 'padre' && !yaEntregaron.has(p.usuarioId._id.toString()))
        .map(p => p.usuarioId);
    } else {
      destinatarios = await User.find({
        _id: { $in: tarea.participantesSeleccionados.filter(id => !yaEntregaron.has(id.toString())) },
        rol: 'padre'
      });
    }

    const datos = {
      tipo: 'tarea',
      mensaje: `Recordatorio: "${tarea.titulo}" vence en 24 horas`,
      prioridad: 'critica',
      referenciaId: tarea._id,
      referenciaModelo: 'Tarea',
      metadata: { fechaEntrega: tarea.fechaEntrega, esRecordatorio: true }
    };

    await Promise.allSettled(
      destinatarios.map(u => notificarFamilia(u._id, datos))
    );

    console.log(`[Recordatorios] Enviados a ${destinatarios.length} familias`);
  } catch (error) {
    console.error('[notificarTareaProximaVencer]', error);
  }
};

/**
 * Bienvenida
 */
export const notificarBienvenida = async (usuarioOId) => {
  try {
    let usuario = typeof usuarioOId === 'string' || usuarioOId instanceof mongoose.Types.ObjectId
      ? await User.findById(usuarioOId)
      : usuarioOId;

    if (!usuario) throw new Error('Usuario no encontrado');

    await crearYEnviarNotificacion({
      usuarioId: usuario._id,
      tipo: 'sistema',
      mensaje: `¡Bienvenido ${usuario.nombre} ${usuario.apellido}! Tu cuenta fue creada exitosamente. Usa tu cédula como contraseña.`,
      prioridad: 'critica',
      referenciaId: usuario._id,
      referenciaModelo: 'User',
      metadata: { rol: usuario.rol, primerInicio: true }
    });
  } catch (error) {
    console.error('[notificarBienvenida]', error);
    throw error;
  }
};

/**
 * Agregado a curso — notifica al usuario y su familia
 */
export const notificarAgregarCurso = async (usuarioId, curso) => {
  try {
    const datos = {
      tipo: 'sistema',
      mensaje: `Has sido agregado al curso "${curso.nombre}"`,
      prioridad: 'critica',
      referenciaId: curso._id,
      referenciaModelo: 'Curso',
      metadata: { cursoNombre: curso.nombre, cursoCodigo: curso.codigoCurso }
    };

    await notificarFamilia(usuarioId, datos);
  } catch (error) {
    console.error('[notificarAgregarCurso]', error);
    throw error;
  }
};

/**
 * Nuevo evento — notifica al docente creador y a los padres de los cursos
 */
export const notificarNuevoEvento = async (evento) => {
  try {
    const Curso = (await import('../models/Curso.js')).default;

    // Notificar al docente
    await crearYEnviarNotificacion({
      usuarioId: evento.docenteId._id,
      tipo: 'evento',
      mensaje: `Creaste el evento "${evento.titulo}". Los participantes han sido notificados.`,
      prioridad: 'critica',
      referenciaId: evento._id,
      referenciaModelo: 'Evento',
      metadata: { eventoTitulo: evento.titulo, esCreador: true }
    });

    // Obtener padres únicos de todos los cursos
    const cursos = await Curso.find({
      _id: { $in: evento.cursosIds.map(c => c._id) }
    }).populate({
      path: 'participantes.usuarioId',
      select: 'nombre apellido correo telefono fcmToken'
    });

    const padresMap = new Map();
    cursos.forEach(curso => {
      curso.participantes.forEach(p => {
        if (p.usuarioId && p.etiqueta === 'padre') {
          padresMap.set(p.usuarioId._id.toString(), p.usuarioId);
        }
      });
    });

    const padres = Array.from(padresMap.values());

    const fechaInicio = new Date(evento.fechaInicio);
    const fechaFormateada = fechaInicio.toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    const datos = {
      tipo: 'evento',
      mensaje: `Nuevo evento: "${evento.titulo}" — ${fechaFormateada} a las ${evento.hora}. Lugar: ${evento.ubicacion}`,
      prioridad: 'critica',
      referenciaId: evento._id,
      referenciaModelo: 'Evento',
      metadata: {
        eventoTitulo: evento.titulo,
        fechaInicio: evento.fechaInicio,
        ubicacion: evento.ubicacion
      }
    };

    await Promise.allSettled(
      padres.map(p => notificarFamilia(p._id, datos))
    );

    console.log(`[notificarNuevoEvento] Notificado a ${padres.length} familias`);
  } catch (error) {
    console.error('[notificarNuevoEvento]', error);
  }
};

// ─────────────────────────────────────────────
// UTILIDADES INTERNAS
// ─────────────────────────────────────────────

/**
 * Resuelve destinatarios según asignacionTipo de la tarea
 */
async function resolverDestinatarios(tarea, curso) {
  if (tarea.asignacionTipo === 'todos') {
    return curso.participantes
      .filter(p => p.usuarioId && p.etiqueta === 'padre')
      .map(p => p.usuarioId);
  }

  if (tarea.asignacionTipo === 'seleccionados') {
    const User = (await import('../models/User.js')).default;
    const ids = tarea.participantesSeleccionados.map(p => p._id || p);
    return User.find({ _id: { $in: ids }, rol: 'padre' })
      .select('nombre apellido correo telefono fcmToken');
  }

  return [];
}

function obtenerTitulo(tipo) {
  const titulos = {
    tarea: '📝 Nueva Tarea',
    entrega: '📤 Nueva Entrega',
    calificacion: '⭐ Calificación',
    foro: '💬 Nuevo Mensaje en Foro',
    evento: '📅 Nuevo Evento',
    sistema: '🔔 Notificación'
  };
  return titulos[tipo] || '🔔 Notificación';
}

function obtenerUrl(notificacion) {
  const urls = {
    tarea: `/tareas/${notificacion.referenciaId}`,
    entrega: `/entregas/${notificacion.referenciaId}`,
    calificacion: `/entregas/${notificacion.referenciaId}`,
    foro: `/foros/${notificacion.referenciaId}`,
    evento: `/eventos/${notificacion.referenciaId}`,
    sistema: '/notificaciones'
  };
  return urls[notificacion.tipo] || '/notificaciones';
}

function generarHTMLEmail(usuario, notificacion) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #F8FAFC; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #ffffff; text-align: center; padding: 25px; border-radius: 12px 12px 0 0; position: relative; overflow: hidden; }
  .bubble { position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.55; }
  .bubble1 { width: 140px; height: 140px; top: -30px; left: -20px; background: linear-gradient(135deg, #00B9F0, #0082B3); }
  .bubble2 { width: 110px; height: 110px; top: 20px; right: -25px; background: linear-gradient(135deg, #FE327B, #D91E5B); }
  .bubble3 { width: 120px; height: 120px; bottom: -40px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #FA6D00, #FE327B); }
  .title { margin-top: 18px; color: #0082B3; font-size: 22px; font-weight: bold; position: relative; z-index: 2; }
  .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
  .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 12px 12px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="bubble bubble1"></div>
    <div class="bubble bubble2"></div>
    <div class="bubble bubble3"></div>
    <h1 class="title">${obtenerTitulo(notificacion.tipo)}</h1>
  </div>
  <div class="content">
    <p>Hola <strong>${usuario.nombre}</strong>,</p>
    <p>${notificacion.mensaje}</p>
  </div>
  <div class="footer">
    <p>Correo automático de <strong>Edumon</strong>. No responder.</p>
    <p>&copy; ${new Date().getFullYear()} Edumon.</p>
  </div>
</div>
</body>
</html>`;
}

export default {
  crearYEnviarNotificacion,
  notificarFamilia,
  enviarFCM,
  enviarFCMMultiple,
  enviarWhatsApp,
  enviarEmail,
  notificarNuevaTarea,
  notificarNuevaEntrega,
  notificarCalificacion,
  notificarTareaProximaVencer,
  notificarTareaCerrada,
  notificarBienvenida,
  notificarAgregarCurso,
  notificarNuevoEvento
};