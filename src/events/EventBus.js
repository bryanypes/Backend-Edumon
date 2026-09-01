// src/events/EventBus.js
import { EventEmitter } from 'events';

// Observer: EventBus es el subject, los listeners son los observers
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }

  suscribir(evento, handler) {
    // EventEmitter no atrapa rejections de listeners async — sin este wrapper
    // un handler que falla puede tumbar el proceso como unhandled rejection
    this.on(evento, async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`[Observer] Error en handler de "${evento}":`, error);
      }
    });
    console.log(`[Observer] Suscrito a evento: "${evento}"`);
  }

  publicar(evento, datos) {
    console.log(`[Observer] Evento publicado: "${evento}"`);
    this.emit(evento, datos);
  }

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
  BUZON_MENSAJE_RECIBIDO: 'buzon.mensaje_recibido',
};

export default eventBus;