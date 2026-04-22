// src/events/EventBus.js
import { EventEmitter } from 'events';

/**
 * PATRÓN OBSERVER
 * EventBus actúa como el "Subject" central.
 * Los listeners son los "Observers".
 * Desacopla quien emite el evento de quien lo procesa.
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }

  /**
   * Registrar un observer para un evento
   * @param {string} evento 
   * @param {Function} handler 
   */
  suscribir(evento, handler) {
    this.on(evento, handler);
    console.log(`[Observer] Suscrito a evento: "${evento}"`);
  }

  /**
   * Emitir evento — notifica a todos los observers suscritos
   * @param {string} evento 
   * @param {Object} datos 
   */
  publicar(evento, datos) {
    console.log(`[Observer] Evento publicado: "${evento}"`);
    this.emit(evento, datos);
  }

  /**
   * Desuscribir un observer
   */
  desuscribir(evento, handler) {
    this.off(evento, handler);
  }
}

// Singleton — una sola instancia para toda la app
export const eventBus = new EventBus();

// Eventos disponibles en el sistema
export const EVENTOS = {
  TAREA_CREADA: 'tarea.creada',
  TAREA_CERRADA: 'tarea.cerrada',
  TAREA_PROXIMA_VENCER: 'tarea.proxima_vencer',
  ENTREGA_CREADA: 'entrega.creada',
  ENTREGA_CALIFICADA: 'entrega.calificada',
  FORO_NUEVO_MENSAJE: 'foro.nuevo_mensaje',
  EVENTO_CREADO: 'evento.creado',
  USUARIO_BIENVENIDA: 'usuario.bienvenida',
  USUARIO_AGREGADO_CURSO: 'usuario.agregado_curso',
};

export default eventBus;