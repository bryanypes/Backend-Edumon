/**
 * PATRÓN STRATEGY
 * Define la interfaz común que todas las estrategias deben implementar.
 * Cada canal de notificación es una estrategia intercambiable.
 */
export class NotificacionStrategy {
  /**
   * @param {Object} usuario - Usuario destinatario
   * @param {Object} notificacion - Objeto notificación de la BD
   * @returns {Promise<boolean>} - true si se envió, false si no
   */
  async enviar(usuario, notificacion) {
    throw new Error('enviar() debe ser implementado por la estrategia concreta');
  }

  nombre() {
    throw new Error('nombre() debe ser implementado');
  }
}