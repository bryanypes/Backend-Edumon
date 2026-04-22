// src/notifications/NotificadorFacade.js
import Notificacion from '../models/Notificacion.js';
import User from '../models/User.js';
import { FCMStrategy } from './strategies/FCMStrategy.js';
import { EmailStrategy } from './strategies/EmailStrategy.js';
import { WhatsAppStrategy } from './strategies/WhatsAppStrategy.js';
import { WebSocketStrategy } from './strategies/WebSocketStrategy.js';

/**
 * PATRÓN FACADE
 * Oculta la complejidad del sistema de notificaciones.
 * El resto de la app solo interactúa con esta clase.
 * Internamente coordina: BD + 4 estrategias + bloque familiar.
 */
class NotificadorFacade {
  constructor() {
    // Registrar estrategias disponibles (Pattern Strategy)
    this.estrategias = [
      new WebSocketStrategy(),
      new FCMStrategy(),
      new EmailStrategy(),
      new WhatsAppStrategy()
    ];
  }

  /**
   * Notificar a un usuario individual
   */
  async notificar(usuarioId, datos) {
    try {
      const usuario = await User.findById(usuarioId);
      if (!usuario || usuario.estado !== 'activo') return null;

      // Guardar en BD
      const notificacion = new Notificacion({
        usuarioId,
        tipo: datos.tipo,
        mensaje: datos.mensaje,
        prioridad: datos.prioridad || 'critica',
        referenciaId: datos.referenciaId,
        referenciaModelo: datos.referenciaModelo,
        metadata: datos.metadata || {}
      });
      await notificacion.save();

      // Ejecutar cada estrategia y registrar resultado
      for (const estrategia of this.estrategias) {
        const enviado = await estrategia.enviar(usuario, notificacion);
        notificacion.canalEnviado[estrategia.nombre()] = enviado;
      }

      await notificacion.save();
      return notificacion;

    } catch (error) {
      console.error(`[NotificadorFacade] Error notificando a ${usuarioId}:`, error.message);
      return null;
    }
  }

  /**
   * Notificar a todo el bloque familiar de un usuario
   */
  async notificarFamilia(usuarioId, datos) {
    const PerfilFamiliar = (await import('../models/PerfilFamiliar.js')).default;

    // 1. Notificar al titular con todos los canales
    await this.notificar(usuarioId, datos);

    // 2. Buscar perfiles adicionales activos del titular
    const perfiles = await PerfilFamiliar.find({
      titularId: usuarioId,
      activo: true,
      fcmToken: { $ne: null }
    });

    if (perfiles.length === 0) return;

    console.log(`[Facade] Enviando push a ${perfiles.length} perfil(es) adicional(es)`);

    // 3. Solo push para perfiles adicionales (no guardan notificación en BD)
    const { FCMStrategy } = await import('./strategies/FCMStrategy.js');
    const fcm = new FCMStrategy();

    await Promise.allSettled(
      perfiles.map(perfil =>
        fcm.enviar(
          { _id: perfil._id, fcmToken: perfil.fcmToken },
          // Construir objeto notificación mínimo para FCM
          {
            _id: `perfil-${perfil._id}`,
            tipo: datos.tipo,
            mensaje: datos.mensaje
          }
        )
      )
    );
  }

  /**
   * Notificar a múltiples usuarios
   */
  async notificarMultiples(usuarioIds, datos) {
    await Promise.allSettled(
      usuarioIds.map(id => this.notificar(id, datos))
    );
  }

  /**
   * Notificar a múltiples usuarios expandiendo sus familias
   */
  async notificarFamilias(usuarioIds, datos) {
    await Promise.allSettled(
      usuarioIds.map(id => this.notificarFamilia(id, datos))
    );
  }
}

// Singleton
export const notificador = new NotificadorFacade();
export default notificador;