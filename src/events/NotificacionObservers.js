// src/events/notificacionObservers.js
import { eventBus, EVENTOS } from './EventBus.js';
import notificador from '../notifications/NotificadorFacade.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';

/**
 * Registra todos los observers del sistema.
 * Llamar una sola vez al iniciar el servidor.
 */
export const registrarObservers = () => {

  // Observer: Tarea creada → notificar a padres + sus familias
  eventBus.suscribir(EVENTOS.TAREA_CREADA, async (tarea) => {
    const destinatarios = await resolverDestinatariosTarea(tarea);
    const fechaFormateada = new Date(tarea.fechaEntrega).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    await notificador.notificarFamilias(
      destinatarios.map(u => u._id),
      {
        tipo: 'tarea',
        mensaje: `Nueva tarea: "${tarea.titulo}". Entrega: ${fechaFormateada}`,
        prioridad: 'critica',
        referenciaId: tarea._id,
        referenciaModelo: 'Tarea',
        metadata: { tareaTitulo: tarea.titulo, fechaEntrega: tarea.fechaEntrega }
      }
    );
  });

  // Observer: Tarea cerrada
  eventBus.suscribir(EVENTOS.TAREA_CERRADA, async (tarea) => {
    const destinatarios = await resolverDestinatariosTarea(tarea);
    await notificador.notificarFamilias(
      destinatarios.map(u => u._id),
      {
        tipo: 'tarea',
        mensaje: `La tarea "${tarea.titulo}" fue cerrada. Ya no se aceptan entregas.`,
        prioridad: 'critica',
        referenciaId: tarea._id,
        referenciaModelo: 'Tarea',
        metadata: { tareaTitulo: tarea.titulo }
      }
    );
  });

  // Observer: Nueva entrega → notificar al docente
  eventBus.suscribir(EVENTOS.ENTREGA_CREADA, async ({ entrega, tarea, padre }) => {
    await notificador.notificar(tarea.docenteId, {
      tipo: 'entrega',
      mensaje: `${padre.nombre} ${padre.apellido} entregó "${tarea.titulo}". Ya puedes calificarla.`,
      prioridad: 'critica',
      referenciaId: entrega._id,
      referenciaModelo: 'Entrega',
      metadata: { tareaTitulo: tarea.titulo }
    });
  });

  // Observer: Entrega calificada → notificar al padre y su familia
  eventBus.suscribir(EVENTOS.ENTREGA_CALIFICADA, async ({ entrega, tarea, padre, docente }) => {
    await notificador.notificarFamilia(padre._id, {
      tipo: 'calificacion',
      mensaje: `"${tarea.titulo}" calificada por ${docente.nombre} ${docente.apellido}. Nota: ${entrega.calificacion.nota}/100`,
      prioridad: 'critica',
      referenciaId: entrega._id,
      referenciaModelo: 'Entrega',
      metadata: { nota: entrega.calificacion.nota }
    });
  });

  // Observer: Evento creado → notificar a padres de los cursos
  eventBus.suscribir(EVENTOS.EVENTO_CREADO, async (evento) => {
    const Curso = (await import('../models/Curso.js')).default;
    const cursos = await Curso.find({
      _id: { $in: evento.cursosIds.map(c => c._id || c) }
    }).populate('participantes.usuarioId', '_id');

    const padresIds = new Set();
    cursos.forEach(curso => {
      curso.participantes.forEach(p => {
        if (p.etiqueta === 'padre' && p.usuarioId) {
          padresIds.add(p.usuarioId._id.toString());
        }
      });
    });

    const fecha = new Date(evento.fechaInicio).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    await notificador.notificarFamilias(
      Array.from(padresIds),
      {
        tipo: 'evento',
        mensaje: `Nuevo evento: "${evento.titulo}" — ${fecha} a las ${evento.hora}`,
        prioridad: 'critica',
        referenciaId: evento._id,
        referenciaModelo: 'Evento',
        metadata: { eventoTitulo: evento.titulo }
      }
    );
  });

  // Observer: Bienvenida
  eventBus.suscribir(EVENTOS.USUARIO_BIENVENIDA, async (usuario) => {
    await notificador.notificar(usuario._id, {
      tipo: 'sistema',
      mensaje: `¡Bienvenido ${usuario.nombre} ${usuario.apellido}! Usa tu cédula como contraseña.`,
      prioridad: 'critica',
      referenciaId: usuario._id,
      referenciaModelo: 'User',
      metadata: { primerInicio: true }
    });
  });

  // Observer: Agregado a curso
  eventBus.suscribir(EVENTOS.USUARIO_AGREGADO_CURSO, async ({ usuarioId, curso }) => {
    await notificador.notificarFamilia(usuarioId, {
      tipo: 'sistema',
      mensaje: `Fuiste agregado al curso "${curso.nombre}"`,
      prioridad: 'critica',
      referenciaId: curso._id,
      referenciaModelo: 'Curso',
      metadata: { cursoNombre: curso.nombre }
    });
  });

  console.log('[Observer] Todos los observers registrados');
};

// Función auxiliar compartida
async function resolverDestinatariosTarea(tarea) {
  const Curso = (await import('../models/Curso.js')).default;
  const User = (await import('../models/User.js')).default;

  const curso = await Curso.findById(tarea.cursoId).populate({
    path: 'participantes.usuarioId',
    select: '_id nombre apellido'
  });

  if (!curso) return [];

  if (tarea.asignacionTipo === 'todos') {
    return curso.participantes
      .filter(p => p.etiqueta === 'padre' && p.usuarioId)
      .map(p => p.usuarioId);
  }

  return User.find({
    _id: { $in: tarea.participantesSeleccionados },
    rol: 'padre'
  }).select('_id');
}