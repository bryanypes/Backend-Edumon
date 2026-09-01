// src/notifications/NotificadorFacade.js
import Notificacion from '../models/Notificacion.js';
import User from '../models/User.js';
import { FCMStrategy } from './strategies/FCMStrategy.js';
import { EmailStrategy } from './strategies/EmailStrategy.js';
import { WhatsAppStrategy } from './strategies/WhatsappStrategy.js';
import { WebSocketStrategy } from './strategies/WebSocketStrategy.js';

// Facade: coordina BD + estrategias de envío + bloque familiar en un solo punto de entrada
class NotificadorFacade {
  constructor() {
    this.estrategias = [
      new WebSocketStrategy(),
      new FCMStrategy(),
      new EmailStrategy(),
      new WhatsAppStrategy()
    ];
  }

  async notificar(usuarioId, datos) {
    try {
      const usuario = await User.findById(usuarioId);
      if (!usuario || usuario.estado !== 'activo') return null;

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

      // en paralelo: cada estrategia atrapa sus propios errores y devuelve false
      const resultados = await Promise.all(
        this.estrategias.map(async (estrategia) => ({
          canal: estrategia.nombre(),
          enviado: await estrategia.enviar(usuario, notificacion)
        }))
      );
      resultados.forEach(({ canal, enviado }) => {
        notificacion.canalEnviado[canal] = enviado;
      });

      await notificacion.save();
      return notificacion;

    } catch (error) {
      console.error(`[NotificadorFacade] Error notificando a ${usuarioId}:`, error.message);
      return null;
    }
  }

  async notificarFamilia(usuarioId, datos) {
    const PerfilFamiliar = (await import('../models/PerfilFamiliar.js')).default;

    await this.notificar(usuarioId, datos);

    const perfiles = await PerfilFamiliar.find({
      titularId: usuarioId,
      activo: true,
      fcmToken: { $ne: null }
    });

    if (perfiles.length === 0) return;

    console.log(`[Facade] Enviando push a ${perfiles.length} perfil(es) adicional(es)`);

    // perfiles adicionales solo reciben push, no se guardan en BD
    const { FCMStrategy } = await import('./strategies/FCMStrategy.js');
    const fcm = new FCMStrategy();

    await Promise.allSettled(
      perfiles.map(perfil =>
        fcm.enviar(
          { _id: perfil._id, fcmToken: perfil.fcmToken },
          {
            _id: `perfil-${perfil._id}`,
            tipo: datos.tipo,
            mensaje: datos.mensaje
          }
        )
      )
    );
  }

  async notificarMultiples(usuarioIds, datos) {
    await Promise.allSettled(
      usuarioIds.map(id => this.notificar(id, datos))
    );
  }

  async notificarFamilias(usuarioIds, datos) {
    await Promise.allSettled(
      usuarioIds.map(id => this.notificarFamilia(id, datos))
    );
  }
}

// Singleton
export const notificador = new NotificadorFacade();
export default notificador;