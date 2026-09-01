// Strategy: interfaz común para los canales de notificación
export class NotificacionStrategy {
  async enviar(usuario, notificacion) {
    throw new Error('enviar() debe ser implementado por la estrategia concreta');
  }

  nombre() {
    throw new Error('nombre() debe ser implementado');
  }
}