import axios from 'axios';
import Notificacion from '../models/Notificacion.js';
import User from '../models/User.js';
import twilio from 'twilio';
import admin from 'firebase-admin';
import { emitirNotificacion } from '../socket/socketHandlers.js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

// Si falta o está mal alguna variable de Firebase, initializeApp() lanza de
// forma síncrona al importar este archivo (arranque del servidor) — sin este
// try/catch tumbaba TODO el backend, incluido login y el resto de la API, por
// una credencial de un solo canal de notificación (push). Con esto, el push
// por FCM queda deshabilitado (enviarFCM ya falla de forma controlada, igual
// que enviarEmail/enviarWhatsApp) pero el resto de la app arranca normal.
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
  } catch (error) {
    console.error('[Firebase] No se pudo inicializar, el push por FCM quedará deshabilitado:', error.message);
  }
}

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Docentes solo reciben correo para eventos que requieren su atención directa
// (nueva entrega); padres y administradores lo reciben para todo.
const TIPOS_EMAIL_DOCENTE = new Set(['entrega', 'sistema']);

function debeRecibirEmail(usuario, tipo) {
  if (!usuario.correo) return false;
  if (usuario.rol === 'docente') return TIPOS_EMAIL_DOCENTE.has(tipo);
  return true;
}

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

    try {
      await emitirNotificacion(notificacion);
      notificacion.canalEnviado.websocket = true;
    } catch (e) {
      console.error('[WS Error]', e.message);
    }

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
        if (e.code === 'messaging/registration-token-not-registered') {
          await User.findByIdAndUpdate(usuarioId, { fcmToken: null });
        }
      }
    }

    if (debeRecibirEmail(usuario, tipo)) {
      try {
        await enviarEmail(usuario, notificacion);
        notificacion.canalEnviado.email = true;
      } catch (e) {
        console.error('[Email Error]', e.message);
      }
    }

    if (usuario.telefono && usuario.rol !== 'docente') {
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

export const notificarFamilia = async (usuarioId, datos) => {
  try {
    const PerfilFamiliar = (await import('../models/PerfilFamiliar.js')).default;

    await crearYEnviarNotificacion({ ...datos, usuarioId });

    const perfiles = await PerfilFamiliar.find({
      titularId: usuarioId,
      activo: true,
      fcmToken: { $ne: null }
    });

    if (perfiles.length === 0) return;

    await Promise.allSettled(
      perfiles.map(perfil =>
        enviarFCM(perfil.fcmToken, {
          title: obtenerTitulo(datos.tipo),
          body: datos.mensaje,
          data: { tipo: datos.tipo }
        }).catch(e => console.error(`[FAMILIA PERFIL] Error push perfil ${perfil._id}:`, e.message))
      )
    );
  } catch (error) {
    console.error('[notificarFamilia] ERROR:', error.message);
  }
};

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
        aps: { sound: 'default', badge: 1 }
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

export const enviarWhatsApp = async (usuario, notificacion) => {
  if (!usuario.telefono) return;

  const mensaje = `🔔 *${obtenerTitulo(notificacion.tipo)}*\n\n${notificacion.mensaje}\n\n_Notificación de Edumon_`;

  await twilioClient.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${usuario.telefono}`,
    body: mensaje
  });
};

export const enviarEmail = async (usuario, notificacion) => {
  if (!usuario.correo) return;
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    throw new Error('Brevo no configurado');
  }

  await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Edumon',
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: usuario.correo, name: `${usuario.nombre} ${usuario.apellido}` }],
      subject: obtenerTitulo(notificacion.tipo),
      htmlContent: generarHTMLEmail(usuario, notificacion)
    },
    {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    }
  );
};

/**
 * Recordatorio de tarea a 24h de vencer. Único punto de entrada de este
 * archivo que se usa en producción (lo dispara tareaScheduler.js); el resto
 * de eventos de dominio (tarea creada, entrega calificada, evento nuevo, etc.)
 * se notifican vía NotificacionObservers.js + NotificadorFacade.
 */
export const notificarTareaProximaVencer = async (tarea) => {
  try {
    const [Curso, Entrega, UserModel] = await Promise.all([
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
      destinatarios = await UserModel.find({
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

function obtenerTitulo(tipo) {
  const titulos = {
    tarea: '📝 Nueva Tarea',
    entrega: '📤 Nueva Entrega',
    calificacion: '⭐ Valoración recibida',
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
  enviarWhatsApp,
  enviarEmail,
  notificarTareaProximaVencer
};
