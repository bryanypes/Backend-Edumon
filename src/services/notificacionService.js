import mongoose from 'mongoose';
import Notificacion from '../models/Notificacion.js';
import User from '../models/User.js';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import webpush from 'web-push';
import { emitirNotificacion } from '../socket/socketHandlers.js';
import dotenv from "dotenv";
dotenv.config({ path: "./.env" }); // fuerza la carga del .env en la raíz
// Configuraciones

// Configurar Web Push
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Ejemplo de envío (para pruebas)
export const sendNotification = async (subscription, payload) => {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log("Notificación enviada");
  } catch (err) {
    console.error("Error enviando notificación:", err);
  }
};

// Configurar Nodemailer (para emails)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

console.log('\n📧 [CONFIGURACIÓN EMAIL]');
console.log(`   EMAIL_SERVICE: ${process.env.EMAIL_SERVICE || 'gmail'}`);
console.log(`   EMAIL_USER: ${process.env.EMAIL_USER || '❌ NO CONFIGURADO'}`);
console.log(`   EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? '✅ Configurado' : '❌ NO CONFIGURADO'}`);

if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transporter.verify(function (error, success) {
    if (error) {
      console.error('❌ Error al verificar servidor de email:', error.message);
    } else {
      console.log('✅ Servidor de email listo');
    }
  });
} else {
  console.warn('⚠️ Email NO configurado - Los emails no se enviarán');
}

// Configurar Twilio (para WhatsApp)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Función principal

/**
 * Crea y envía una notificación por los canales apropiados
 * @param {Object} datos - Datos de la notificación
 * @returns {Promise<Object>} - Notificación creada
 */
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

    console.log(`\n🔔 [NUEVA NOTIFICACIÓN]`);
    console.log(`   Usuario: ${usuarioId}`);
    console.log(`   Tipo: ${tipo}`);
    console.log(`   Prioridad: ${prioridad}`);

    // Obtener usuario
    const usuario = await User.findById(usuarioId);
    if (!usuario) {
      throw new Error(`Usuario no encontrado: ${usuarioId}`);
    }

    console.log(`   Usuario encontrado: ${usuario.nombre} ${usuario.apellido} (${usuario.rol})`);
    console.log(`   Correo: ${usuario.correo}`);
    console.log(`   Teléfono: ${usuario.telefono || 'N/A'}`);

    // Crear notificación en BD
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
    console.log(`   ✅ Notificación guardada en BD (${notificacion._id})`);

    // 1️⃣ WEBSOCKET
    try {
      await emitirNotificacion(notificacion);
      notificacion.canalEnviado.websocket = true;
      console.log(`   ✅ WebSocket enviado`);
    } catch (error) {
      console.error(`   ❌ Error WebSocket:`, error.message);
    }

    // 2️⃣ PUSH
    try {
      await enviarNotificacionPush(usuario, notificacion);
      notificacion.canalEnviado.push = true;
      console.log(`   ✅ Push enviado`);
    } catch (error) {
      console.error(`   ❌ Error Push:`, error.message);
    }

    // 3️⃣ EMAIL - SIEMPRE INTENTAR
    console.log(`\n📧 [EMAIL] Verificando envío...`);
    console.log(`   ¿Tiene correo? ${usuario.correo ? 'SÍ' : 'NO'}`);
    
    if (usuario.correo) {
      try {
        console.log(`   🚀 Intentando enviar email a ${usuario.correo}...`);
        await enviarNotificacionEmail(usuario, notificacion);
        notificacion.canalEnviado.email = true;
        console.log(`   ✅ Email enviado exitosamente`);
      } catch (error) {
        console.error(`   ❌ Error enviando Email:`);
        console.error(`      Mensaje: ${error.message}`);
        console.error(`      Stack:`, error.stack);
      }
    } else {
      console.warn(`   ⚠️ No se puede enviar: usuario sin correo`);
    }

    // 4️⃣ WHATSAPP - SIEMPRE INTENTAR
    console.log(`\n📱 [WHATSAPP] Verificando envío...`);
    console.log(`   ¿Tiene teléfono? ${usuario.telefono ? 'SÍ' : 'NO'}`);
    
    if (usuario.telefono) {
      try {
        console.log(`   🚀 Intentando enviar WhatsApp a ${usuario.telefono}...`);
        await enviarNotificacionWhatsApp(usuario, notificacion);
        notificacion.canalEnviado.whatsapp = true;
        console.log(`   ✅ WhatsApp enviado exitosamente`);
      } catch (error) {
        console.error(`   ❌ Error enviando WhatsApp:`);
        console.error(`      Mensaje: ${error.message}`);
      }
    } else {
      console.warn(`   ⚠️ No se puede enviar: usuario sin teléfono`);
    }

    // Guardar canales enviados
    await notificacion.save();

    console.log(`\n✅ Proceso completado`);
    console.log(`   Canales exitosos:`);
    console.log(`      WebSocket: ${notificacion.canalEnviado.websocket}`);
    console.log(`      Push: ${notificacion.canalEnviado.push}`);
    console.log(`      Email: ${notificacion.canalEnviado.email}`);
    console.log(`      WhatsApp: ${notificacion.canalEnviado.whatsapp}`);

    return notificacion;
  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO en crearYEnviarNotificacion:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
};

// Funciones de envio

/**
 * Envía notificación push
 */
export const enviarNotificacionPush = async (usuario, notificacion) => {
  try {
    // Obtener suscripciones push del usuario (debes guardarlas en tu BD)
    const suscripciones = await obtenerSuscripcionesPush(usuario._id);

    if (!suscripciones || suscripciones.length === 0) {
      console.log('Usuario sin suscripciones push');
      return;
    }

    const payload = JSON.stringify({
      title: obtenerTituloPush(notificacion.tipo),
      body: notificacion.mensaje,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        notificacionId: notificacion._id,
        tipo: notificacion.tipo,
        url: obtenerUrlNotificacion(notificacion)
      }
    });

    const promesas = suscripciones.map(suscripcion =>
      webpush.sendNotification(suscripcion, payload)
        .catch(error => {
          console.error('Error al enviar a suscripción:', error);
          // Si la suscripción expiró, eliminarla de la BD
          if (error.statusCode === 410) {
            eliminarSuscripcionPush(suscripcion.endpoint);
          }
        })
    );

    await Promise.allSettled(promesas);
    console.log(`Push enviado a ${usuario.nombre}`);
  } catch (error) {
    console.error('Error en enviarNotificacionPush:', error);
    throw error;
  }
};

/**
 * Envía notificación por WhatsApp
 */
export const enviarNotificacionWhatsApp = async (usuario, notificacion) => {
  try {
    if (!usuario.telefono) {
      console.log('Usuario sin teléfono');
      return;
    }

    const mensaje = `
🔔 *${obtenerTituloPush(notificacion.tipo)}*

${notificacion.mensaje}

---
_Notificación de Edumon_
    `.trim();

    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${usuario.telefono}`,
      body: mensaje
    });

    console.log(`WhatsApp enviado a ${usuario.nombre}`);
  } catch (error) {
    console.error('Error en enviarNotificacionWhatsApp:', error);
    throw error;
  }
};

/**
 * Envía notificación por email (solo docentes)
 */
export const enviarNotificacionEmail = async (usuario, notificacion) => {
  try {
    console.log(`\n📧 [ENVIAR EMAIL] Iniciando...`);
    console.log(`   Para: ${usuario.nombre} ${usuario.apellido}`);
    console.log(`   Email: ${usuario.correo}`);
    console.log(`   Tipo: ${notificacion.tipo}`);

    // Verificar configuración
    if (!process.env.EMAIL_USER) {
      throw new Error('EMAIL_USER no configurado en .env');
    }
    if (!process.env.EMAIL_PASSWORD) {
      throw new Error('EMAIL_PASSWORD no configurado en .env');
    }

    console.log(`   Servidor email: ${process.env.EMAIL_SERVICE || 'gmail'}`);
    console.log(`   Desde: ${process.env.EMAIL_USER}`);

    const mailOptions = {
      from: `"Edumon" <${process.env.EMAIL_USER}>`,
      to: usuario.correo,
      subject: obtenerTituloPush(notificacion.tipo),
      html: generarHTMLEmail(usuario, notificacion)
    };

    console.log(`   📤 Enviando email...`);
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`   ✅ Email enviado`);
    console.log(`   Message ID: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error(`\n❌ ERROR en enviarNotificacionEmail:`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Código: ${error.code}`);
    
    // Errores específicos de Gmail
    if (error.code === 'EAUTH') {
      console.error(`   ⚠️ ERROR DE AUTENTICACIÓN`);
      console.error(`   - Verifica que EMAIL_USER sea correcto`);
      console.error(`   - Para Gmail, usa App Password (no tu contraseña normal)`);
      console.error(`   - Activa verificación en 2 pasos en Google`);
    }
    
    throw error;
  }
};

// Funciones auxiliares

function obtenerTituloPush(tipo) {
  const titulos = {
    tarea: '📝 Nueva Tarea',
    entrega: '📤 Nueva Entrega',
    calificacion: '⭐ Nueva Calificación',
    foro: '💬 Nuevo Mensaje en Foro',
    evento: '📅 Nuevo Evento',
    sistema: '🔔 Notificación del Sistema'
  };
  return titulos[tipo] || '🔔 Notificación';
}

function obtenerUrlNotificacion(notificacion) {
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
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${obtenerTituloPush(notificacion.tipo)}</h1>
        </div>
        <div class="content">
          <p>Hola <strong>${usuario.nombre}</strong>,</p>
          <p>${notificacion.mensaje}</p>
        </div>
        <div class="footer">
          <p>Este es un correo automático de <strong>Edumon</strong>. Por favor no responder.</p>
          <p>&copy; ${new Date().getFullYear()} Edumon. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}


// Funciones suscripciones push

/**
 * Obtener suscripciones push de un usuario
 * Debes crear un modelo PushSubscription para guardarlas
 */

// Reemplaza las funciones por estas versiones corregidas:
async function obtenerSuscripcionesPush(usuarioId) {
  try {
    const suscripciones = await PushSubscription.find({
      usuarioId,
      activa: true
    });
    console.log(`📱 Suscripciones push encontradas: ${suscripciones.length}`);
    return suscripciones;
  } catch (error) {
    console.error('❌ Error al obtener suscripciones:', error);
    return [];
  }
}

async function eliminarSuscripcionPush(endpoint) {
  try {
    await PushSubscription.deleteOne({ endpoint });
    console.log('🗑️ Suscripción expirada eliminada');
  } catch (error) {
    console.error('❌ Error al eliminar suscripción:', error);
  }
}

/**
 * Notificación cuando se crea una tarea
 */
/**
 * Notificación cuando se crea una tarea
 */
export const notificarNuevaTarea = async (tarea) => {
  try {
    console.log(`\n📝 [NUEVA TAREA] Iniciando notificaciones`);
    console.log(`Tarea: ${tarea.titulo} (${tarea._id})`);
    console.log(`Curso ID: ${tarea.cursoId?._id || tarea.cursoId}`);
    console.log(`Asignación tipo: ${tarea.asignacionTipo}`);

    // Obtener curso con participantes si no está poblado
    const Curso = (await import('../models/Curso.js')).default;
    let curso;
    
    if (tarea.cursoId?.participantes) {
      // Ya está poblado
      curso = tarea.cursoId;
      console.log(`Curso ya poblado: ${curso.nombre}`);
    } else {
      // Poblar curso
      curso = await Curso.findById(tarea.cursoId).populate({
        path: 'participantes.usuarioId',
        select: 'nombre apellido correo telefono rol'
      });
      console.log(`Curso poblado: ${curso.nombre}`);
    }

    if (!curso) {
      console.error('Curso no encontrado');
      return;
    }

    console.log(`Total participantes en curso: ${curso.participantes.length}`);

    // Determinar destinatarios según asignación
    let destinatarios = [];

    if (tarea.asignacionTipo === 'todos') {
      console.log(`Asignación a todos los padres del curso`);
      
      // Filtrar solo padres activos
      destinatarios = curso.participantes
        .filter(p => {
          const usuario = p.usuarioId;
          if (!usuario) {
            console.log(`Participante sin usuario (null)`);
            return false;
          }
          if (p.etiqueta !== 'padre') {
            console.log(`Saltando ${usuario.nombre} (${p.etiqueta})`);
            return false;
          }
          console.log(`Incluir ${usuario.nombre} ${usuario.apellido} (${usuario._id})`);
          return true;
        })
        .map(p => p.usuarioId);

    } else if (tarea.asignacionTipo === 'seleccionados') {
      console.log(`👥 Asignación a participantes SELECCIONADOS`);
      console.log(`IDs seleccionados:`, tarea.participantesSeleccionados);
      
      const User = (await import('../models/User.js')).default;
      
      // Siempre obtener desde la BD para tener el campo 'rol'
      const participantesIds = tarea.participantesSeleccionados.map(p => {
        // Si ya está poblado, obtener el _id
        if (p._id) return p._id;
        // Si es un ObjectId directo
        return p;
      });

      console.log(`IDs a buscar en BD:`, participantesIds);

      destinatarios = await User.find({
        _id: { $in: participantesIds },
        rol: 'padre' // Solo traer padres
      }).select('nombre apellido correo telefono rol');

      console.log(`Participantes encontrados en BD: ${destinatarios.length}`);
      
      destinatarios.forEach(u => {
        console.log(`  - ${u.nombre} ${u.apellido} (${u._id}) - Rol: ${u.rol} - Tel: ${u.telefono || 'N/A'}`);
      });
    }

    console.log(`\nTotal destinatarios a notificar: ${destinatarios.length}`);

    if (destinatarios.length === 0) {
      console.log(`No hay destinatarios para notificar`);
      
      // Debug adicional
      if (tarea.asignacionTipo === 'seleccionados') {
        console.log(`\nDEBUG: Revisando participantes seleccionados...`);
        const User = (await import('../models/User.js')).default;
        const participantesIds = tarea.participantesSeleccionados.map(p => p._id || p);
        
        const todosLosUsuarios = await User.find({
          _id: { $in: participantesIds }
        }).select('nombre apellido rol');
        
        console.log(`Total usuarios encontrados (sin filtro de rol): ${todosLosUsuarios.length}`);
        todosLosUsuarios.forEach(u => {
          console.log(`  - ${u.nombre} ${u.apellido} - Rol: ${u.rol} ${u.rol === 'padre' ? '✅' : '❌ (no es padre)'}`);
        });
      }
      
      return;
    }

    // Formatear fecha de entrega
    const fechaEntrega = new Date(tarea.fechaEntrega);
    const fechaFormateada = fechaEntrega.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Crear notificaciones para cada destinatario
    const promesas = destinatarios.map(async (usuario, index) => {
      try {
        console.log(`\n[${index + 1}/${destinatarios.length}] Notificando a ${usuario.nombre} ${usuario.apellido}`);
        console.log(`  - ID: ${usuario._id}`);
        console.log(`  - Rol: ${usuario.rol}`);
        console.log(`  - Tel: ${usuario.telefono || 'N/A'}`);
        
        await crearYEnviarNotificacion({
          usuarioId: usuario._id,
          tipo: 'tarea',
          mensaje: `Nueva tarea asignada: "${tarea.titulo}". Fecha de entrega: ${fechaFormateada}`,
          prioridad: 'critica',
          referenciaId: tarea._id,
          referenciaModelo: 'Tarea',
          metadata: {
            cursoNombre: curso.nombre,
            tareaTitulo: tarea.titulo,
            fechaEntrega: tarea.fechaEntrega,
            tipoEntrega: tarea.tipoEntrega,
            asignacionTipo: tarea.asignacionTipo
          }
        });

        console.log(`Notificación enviada exitosamente`);
        return { success: true, usuario: usuario._id };
      } catch (error) {
        console.error(`Error al notificar a ${usuario.nombre}:`, error.message);
        return { success: false, usuario: usuario._id, error: error.message };
      }
    });

    const resultados = await Promise.allSettled(promesas);
    
    const exitosos = resultados.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const fallidos = resultados.filter(r => r.status === 'rejected' || !r.value.success).length;

    console.log(`\nResumen de notificaciones de tarea:`);
    console.log(`  Exitosas: ${exitosos}`);
    console.log(`  Fallidas: ${fallidos}`);
    console.log(`  Total: ${destinatarios.length}`);

  } catch (error) {
    console.error('Error en notificarNuevaTarea:', error);
    console.error('Stack:', error.stack);
  }
};

/**
 * Notificación cuando se cierra una tarea
 */
export const notificarTareaCerrada = async (tarea) => {
  try {
    console.log(`\n[TAREA CERRADA] Iniciando notificaciones`);
    console.log(`Tarea: ${tarea.titulo} (${tarea._id})`);

    // Obtener curso con participantes
    const Curso = (await import('../models/Curso.js')).default;
    let curso;
    
    if (tarea.cursoId?.participantes) {
      curso = tarea.cursoId;
    } else {
      curso = await Curso.findById(tarea.cursoId).populate({
        path: 'participantes.usuarioId',
        select: 'nombre apellido correo telefono rol'
      });
    }

    if (!curso) {
      console.error('Curso no encontrado');
      return;
    }

    let destinatarios = [];

    if (tarea.asignacionTipo === 'todos') {
      destinatarios = curso.participantes
        .filter(p => p.usuarioId && p.etiqueta === 'padre')
        .map(p => p.usuarioId);
    } else if (tarea.asignacionTipo === 'seleccionados') {
      const User = (await import('../models/User.js')).default;
      
      if (tarea.participantesSeleccionados?.[0]?.nombre) {
        destinatarios = tarea.participantesSeleccionados.filter(u => u.rol === 'padre');
      } else {
        destinatarios = await User.find({
          _id: { $in: tarea.participantesSeleccionados },
          rol: 'padre'
        });
      }
    }

    console.log(`Total destinatarios: ${destinatarios.length}`);

    const promesas = destinatarios.map(usuario =>
      crearYEnviarNotificacion({
        usuarioId: usuario._id,
        tipo: 'tarea',
        mensaje: `La tarea "${tarea.titulo}" ha sido cerrada. Ya no se aceptan más entregas.`,
        prioridad: 'critica',
        referenciaId: tarea._id,
        referenciaModelo: 'Tarea',
        metadata: {
          cursoNombre: curso.nombre,
          tareaTitulo: tarea.titulo,
          fechaCierre: new Date()
        }
      })
    );

    const resultados = await Promise.allSettled(promesas);
    const exitosos = resultados.filter(r => r.status === 'fulfilled').length;

    console.log(`Notificaciones de cierre enviadas: ${exitosos}/${destinatarios.length}`);
  } catch (error) {
    console.error('Error en notificarTareaCerrada:', error);
  }
};

export const notificarNuevaEntrega = async (entrega) => {
  try {
    console.log(`\n[NUEVA ENTREGA] Iniciando notificación`);
    
    // Verificar que entrega esté completamente poblada
    if (!entrega.tareaId) {
      console.error('entrega.tareaId no está poblada');
      return;
    }
    
    if (!entrega.tareaId.docenteId) {
      console.error('entrega.tareaId.docenteId no está poblada');
      return;
    }
    
    if (!entrega.padreId) {
      console.error(' entrega.padreId no está poblada');
      return;
    }

    const tarea = entrega.tareaId;
    const docente = tarea.docenteId;
    const padre = entrega.padreId;

    console.log(`  Datos verificados:`);
    console.log(`  Tarea: ${tarea.titulo}`);
    console.log(`  Docente: ${docente.nombre} ${docente.apellido} (${docente.correo})`);
    console.log(`  Padre: ${padre.nombre} ${padre.apellido}`);

    // LOGS DE DEBUG CRÍTICOS
    console.log(`\n [DEBUG] Verificando IDs antes de notificar:`);
    console.log(`   Usuario a notificar (docente._id): ${docente._id}`);
    console.log(`   Rol del docente: ${docente.rol}`);
    console.log(`   Email del docente: ${docente.correo}`);
    console.log(`   NO debe ser padre._id: ${padre._id}`);

    await crearYEnviarNotificacion({
      usuarioId: docente._id,
      tipo: 'entrega',
      mensaje: `${padre.nombre} ${padre.apellido} ha enviado la entrega de "${tarea.titulo}". Ya puedes calificarla.`,
      prioridad: 'critica',
      referenciaId: entrega._id,
      referenciaModelo: 'Entrega',
      metadata: {
        tareaTitulo: tarea.titulo,
        padreNombre: `${padre.nombre} ${padre.apellido}`,
        estado: entrega.estado,
        fechaEntrega: entrega.fechaEntrega
      }
    });

    console.log('Notificación de entrega enviada al docente (con email)');
  } catch (error) {
    console.error('Error en notificarNuevaEntrega:', error);
    console.error('Stack:', error.stack);
  }
};

/**
 * Notificación cuando se califica una entrega
 * 📱 Envía SOLO WHATSAPP al padre (sin email ni push)
 */
export const notificarCalificacion = async (entrega) => {
  try {
    console.log(`\n[CALIFICACIÓN] Iniciando notificación`);
    
    const Tarea = (await import('../models/Tarea.js')).default;
    const User = (await import('../models/User.js')).default;
    
    const tarea = await Tarea.findById(entrega.tareaId);
    if (!tarea) {
      console.error('Tarea no encontrada');
      return;
    }

    const padre = await User.findById(entrega.padreId);
    if (!padre) {
      console.error('Padre no encontrado');
      return;
    }

    const docente = await User.findById(entrega.calificacion.docenteId);
    if (!docente) {
      console.error('Docente no encontrado');
      return;
    }

    console.log(`Tarea: ${tarea.titulo}`);
    console.log(`Padre: ${padre.nombre} ${padre.apellido} (${padre.telefono || 'sin teléfono'})`);
    console.log(`Nota: ${entrega.calificacion.nota}/100`);

    // ENVÍO PERSONALIZADO: Solo WhatsApp al padre
    const notificacion = new Notificacion({
      usuarioId: padre._id,
      tipo: 'calificacion',
      mensaje: `Tu entrega de "${tarea.titulo}" ha sido calificada por ${docente.nombre} ${docente.apellido}. Nota: ${entrega.calificacion.nota}/100`,
      prioridad: 'critica',
      referenciaId: entrega._id,
      referenciaModelo: 'Entrega',
      metadata: {
        tareaTitulo: tarea.titulo,
        nota: entrega.calificacion.nota,
        comentario: entrega.calificacion.comentario,
        docenteNombre: `${docente.nombre} ${docente.apellido}`,
        fechaCalificacion: entrega.calificacion.fechaCalificacion
      }
    });

    await notificacion.save();

    // 1️⃣ WebSocket (siempre)
    try {
      await emitirNotificacion(notificacion);
      notificacion.canalEnviado.websocket = true;
      console.log('WebSocket enviado');
    } catch (error) {
      console.error('Error al enviar WebSocket:', error);
    }

    // 2️⃣ WhatsApp (solo si tiene teléfono)
    if (padre.telefono) {
      try {
        await enviarNotificacionWhatsApp(padre, notificacion);
        notificacion.canalEnviado.whatsapp = true;
        console.log(`WhatsApp enviado a ${padre.telefono}`);
      } catch (error) {
        console.error('Error al enviar WhatsApp:', error);
      }
    } else {
      console.warn(`Padre sin teléfono, no se envió WhatsApp`);
    }

    await notificacion.save();
    console.log('Notificación de calificación enviada (WhatsApp únicamente)');
  } catch (error) {
    console.error('Error en notificarCalificacion:', error);
  }
};

/**
 * Notificación cuando una tarea está próxima a vencer (24 horas)
 */
export const notificarTareaProximaVencer = async (tarea) => {
  try {
    const Curso = (await import('../models/curso.model.js')).default;
    const Entrega = (await import('../models/entrega.model.js')).default;

    const curso = await Curso.findById(tarea.cursoId).populate('participantes');
    if (!curso) return;

    // Obtener padres que AÚN NO han entregado
    const entregasRealizadas = await Entrega.find({
      tareaId: tarea._id,
      estado: { $in: ['enviada', 'tarde'] }
    }).distinct('padreId');

    let destinatarios = [];
    if (tarea.asignacionTipo === 'todos') {
      destinatarios = curso.participantes.filter(p =>
        p.rol === 'padre' &&
        !entregasRealizadas.some(id => id.equals(p._id))
      );
    } else if (tarea.asignacionTipo === 'seleccionados') {
      destinatarios = await User.find({
        _id: {
          $in: tarea.participantesSeleccionados.filter(id =>
            !entregasRealizadas.some(entregaId => entregaId.equals(id))
          )
        },
        rol: 'padre'
      });
    }

    const promesas = destinatarios.map(usuario =>
      crearYEnviarNotificacion({
        usuarioId: usuario._id,
        tipo: 'tarea',
        mensaje: `Recordatorio: La tarea "${tarea.titulo}" vence en 24 horas`,
        prioridad: 'critica',
        referenciaId: tarea._id,
        referenciaModelo: 'Tarea',
        metadata: {
          cursoNombre: curso.nombre,
          fechaEntrega: tarea.fechaEntrega,
          esRecordatorio: true
        }
      })
    );

    await Promise.allSettled(promesas);
    console.log(`Recordatorios enviados a ${destinatarios.length} usuarios`);
  } catch (error) {
    console.error('Error en notificarTareaProximaVencer:', error);
  }
};

/**
 * Notificación de bienvenida a nuevo usuario
 */
// ✅ DESPUÉS - Acepta ID o usuario completo
export const notificarBienvenida = async (usuarioOId) => {
  try {
    console.log(`\n👋 [BIENVENIDA] Iniciando notificación`);
    
    // Si recibe un string/ObjectId, buscar el usuario
    let usuario;
    if (typeof usuarioOId === 'string' || usuarioOId instanceof mongoose.Types.ObjectId) {
      console.log(`   Buscando usuario por ID: ${usuarioOId}`);
      usuario = await User.findById(usuarioOId);
      
      if (!usuario) {
        console.error(`   ❌ Usuario no encontrado: ${usuarioOId}`);
        throw new Error('Usuario no encontrado');
      }
    } else {
      // Ya es un objeto usuario
      usuario = usuarioOId;
    }

    console.log(`   Usuario: ${usuario.nombre} ${usuario.apellido}`);
    console.log(`   Email: ${usuario.correo}`);
    console.log(`   Teléfono: ${usuario.telefono || 'N/A'}`);

    await crearYEnviarNotificacion({
      usuarioId: usuario._id,
      tipo: 'sistema',
      mensaje: `¡Bienvenido ${usuario.nombre} ${usuario.apellido}! Tu cuenta ha sido creada exitosamente. Usa tu cédula como contraseña para iniciar sesión.`,
      prioridad: 'critica',
      referenciaId: usuario._id,
      referenciaModelo: 'User',
      metadata: {
        rol: usuario.rol,
        fechaRegistro: usuario.fechaRegistro,
        primerInicio: true
      }
    });

    console.log(`   ✅ Notificación de bienvenida enviada`);
  } catch (error) {
    console.error('❌ Error en notificarBienvenida:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
};

/**
 * Notificación cuando se agrega a un curso
 */
export const notificarAgregarCurso = async (usuarioId, curso) => {
  try {
    const usuario = await User.findById(usuarioId);
    
    if (!usuario) {
      console.error('Usuario no encontrado para notificar');
      return;
    }

    // Crear notificación
    const notificacion = new Notificacion({
      usuarioId,
      tipo: 'sistema',
      mensaje: `Has sido agregado al curso "${curso.nombre}"`,
      prioridad: 'critica', 
      referenciaId: curso._id,
      referenciaModelo: 'Curso',
      metadata: {
        cursoNombre: curso.nombre,
        cursoCodigo: curso.codigoCurso,
        docenteNombre: curso.docenteId ? `${curso.docenteId.nombre} ${curso.docenteId.apellido}` : 'N/A'
      }
    });

    await notificacion.save();

    // WebSocket
    try {
      await emitirNotificacion(notificacion);
      notificacion.canalEnviado.websocket = true;
    } catch (error) {
      console.error('Error al enviar por WebSocket:', error);
    }

    // Push
    try {
      await enviarNotificacionPush(usuario, notificacion);
      notificacion.canalEnviado.push = true;
    } catch (error) {
      console.error('Error al enviar Push:', error);
    }

    // Verifica que el usuario tenga teléfono antes de enviar WhatsApp
    if (usuario.telefono) {
      try {
        await enviarNotificacionWhatsApp(usuario, notificacion);
        notificacion.canalEnviado.whatsapp = true;
        console.log(`WhatsApp enviado a ${usuario.nombre} ${usuario.apellido} (${usuario.telefono})`);
      } catch (error) {
        console.error(`Error al enviar WhatsApp a ${usuario.telefono}:`, error);
      }
    } else {
      console.warn(`Usuario ${usuario.nombre} ${usuario.apellido} sin teléfono registrado`);
    }

    await notificacion.save();
    console.log('Notificación de nuevo curso enviada');
  } catch (error) {
    console.error('Error en notificarAgregarCurso:', error);
    throw error;
  }
};

/**
 * Notificación cuando se crea un nuevo evento
 * Envía notificaciones a:
 * - DOCENTE que creó el evento (email + push + whatsapp)
 * - PADRES de los cursos seleccionados (email + push + whatsapp)
 */
export const notificarNuevoEvento = async (evento) => {
  try {
    console.log(`\n[NUEVO EVENTO] Iniciando notificaciones`);
    console.log(`Evento: ${evento.titulo} (${evento._id})`);
    console.log(`Docente: ${evento.docenteId.nombre} ${evento.docenteId.apellido}`);
    console.log(`Cursos: ${evento.cursosIds.map(c => c.nombre).join(', ')}`);

    const Curso = (await import('../models/Curso.js')).default;
    const User = (await import('../models/User.js')).default;

    // 1️Notificar al DOCENTE que creó el evento
    try {
      console.log(`\nNotificando al docente creador...`);
      
      await crearYEnviarNotificacion({
        usuarioId: evento.docenteId._id,
        tipo: 'evento',
        mensaje: `Has creado el evento "${evento.titulo}" para ${evento.cursosIds.length} curso(s). Los participantes han sido notificados.`,
        prioridad: 'critica',
        referenciaId: evento._id,
        referenciaModelo: 'Evento',
        metadata: {
          eventoTitulo: evento.titulo,
          categoria: evento.categoria,
          fechaInicio: evento.fechaInicio,
          fechaFin: evento.fechaFin,
          hora: evento.hora,
          ubicacion: evento.ubicacion,
          cursosNombres: evento.cursosIds.map(c => c.nombre),
          esCreador: true
        }
      });

      console.log(`Docente notificado exitosamente`);
    } catch (error) {
      console.error(`Error al notificar al docente:`, error);
    }

    // Obtener todos los PADRES de los cursos seleccionados
    console.log(`\nObteniendo padres de los cursos...`);
    
    const cursos = await Curso.find({
      _id: { $in: evento.cursosIds.map(c => c._id) }
    }).populate({
      path: 'participantes.usuarioId',
      select: 'nombre apellido correo telefono rol'
    });

    console.log(`${cursos.length} curso(s) encontrado(s)`);

    // Recolectar padres únicos (un padre puede estar en múltiples cursos)
    const padresSet = new Set();
    const padresMap = new Map();

    cursos.forEach(curso => {
      console.log(`\n Curso: ${curso.nombre}`);
      console.log(`   Participantes totales: ${curso.participantes.length}`);
      
      curso.participantes.forEach(p => {
        const usuario = p.usuarioId;
        
        if (!usuario) {
          console.log(`    Participante sin usuario (null)`);
          return;
        }
        
        if (p.etiqueta !== 'padre') {
          console.log(`    Saltando ${usuario.nombre} (${p.etiqueta})`);
          return;
        }

        const padreId = usuario._id.toString();
        
        if (!padresSet.has(padreId)) {
          padresSet.add(padreId);
          padresMap.set(padreId, usuario);
          console.log(`    Agregado: ${usuario.nombre} ${usuario.apellido} (${usuario.correo})`);
        } else {
          console.log(`    Ya agregado: ${usuario.nombre} ${usuario.apellido}`);
        }
      });
    });

    const padres = Array.from(padresMap.values());
    console.log(`\n Total padres únicos a notificar: ${padres.length}`);

    if (padres.length === 0) {
      console.log(` No hay padres para notificar`);
      return;
    }

    // Formatear fechas para el mensaje
    const fechaInicio = new Date(evento.fechaInicio);
    const fechaFin = new Date(evento.fechaFin);
    
    const fechaInicioFormateada = fechaInicio.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    const fechaFinFormateada = fechaFin.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const mensajeFecha = fechaInicio.toDateString() === fechaFin.toDateString()
      ? `${fechaInicioFormateada} a las ${evento.hora}`
      : `Del ${fechaInicioFormateada} al ${fechaFinFormateada} a las ${evento.hora}`;

    // Enviar notificaciones a cada padre
    const promesas = padres.map(async (padre, index) => {
      try {
        console.log(`\n[${index + 1}/${padres.length}] Notificando a ${padre.nombre} ${padre.apellido}`);
        console.log(`  - ID: ${padre._id}`);
        console.log(`  - Email: ${padre.correo}`);
        console.log(`  - Tel: ${padre.telefono || 'N/A'}`);
        
        await crearYEnviarNotificacion({
          usuarioId: padre._id,
          tipo: 'evento',
          mensaje: `Nuevo evento "${evento.titulo}": ${mensajeFecha}. Ubicación: ${evento.ubicacion}`,
          prioridad: 'critica',
          referenciaId: evento._id,
          referenciaModelo: 'Evento',
          metadata: {
            eventoTitulo: evento.titulo,
            categoria: evento.categoria,
            descripcion: evento.descripcion,
            fechaInicio: evento.fechaInicio,
            fechaFin: evento.fechaFin,
            hora: evento.hora,
            ubicacion: evento.ubicacion,
            docenteNombre: `${evento.docenteId.nombre} ${evento.docenteId.apellido}`,
            cursosNombres: evento.cursosIds.map(c => c.nombre)
          }
        });

        console.log(` Notificación enviada exitosamente`);
        return { success: true, padre: padre._id };
      } catch (error) {
        console.error(` Error al notificar a ${padre.nombre}:`, error.message);
        return { success: false, padre: padre._id, error: error.message };
      }
    });

    const resultados = await Promise.allSettled(promesas);
    
    const exitosos = resultados.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const fallidos = resultados.filter(r => r.status === 'rejected' || !r.value.success).length;

    console.log(`\n Resumen de notificaciones de evento:`);
    console.log(`   Exitosas: ${exitosos}`);
    console.log(`   Fallidas: ${fallidos}`);
    console.log(`   Total padres: ${padres.length}`);
    console.log(`   Docente notificado: 1`);
    console.log(`   Total notificaciones: ${padres.length + 1}`);

  } catch (error) {
    console.error(' Error en notificarNuevoEvento:', error);
    console.error('Stack:', error.stack);
  }
};

//Exportar las funciones
export default {
  crearYEnviarNotificacion,
  enviarNotificacionPush,
  enviarNotificacionWhatsApp,
  enviarNotificacionEmail,
  notificarNuevaTarea,
  notificarNuevaEntrega,
  notificarCalificacion,
  notificarTareaProximaVencer,
  notificarTareaCerrada,
  notificarBienvenida,
  notificarAgregarCurso,
  notificarNuevoEvento
};