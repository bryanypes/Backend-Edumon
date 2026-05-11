import Tarea from '../models/Tarea.js';
import Evento from '../models/Evento.js';
import Curso from '../models/Curso.js';

// Obtener todos los eventos del calendario de un curso
export const obtenerCalendarioCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { mes, anio } = req.query; // Opcional: filtrar por mes/año

    // Verificar que el curso existe
    const curso = await Curso.findById(cursoId);
    if (!curso) {
      return res.status(404).json({ 
        error: 'Curso no encontrado' 
      });
    }

    // Construir filtro de fechas si se proporciona mes/año
    let filtroFechas = {};
    if (mes && anio) {
      const inicioMes = new Date(anio, mes - 1, 1);
      const finMes = new Date(anio, mes, 0, 23, 59, 59);
      filtroFechas = {
        $gte: inicioMes,
        $lte: finMes
      };
    }

    // Obtener tareas del curso
    const tareas = await Tarea.find({
      cursoId,
      ...(Object.keys(filtroFechas).length > 0 && { fechaEntrega: filtroFechas })
    })
      .populate('moduloId', 'titulo')
      .select('titulo descripcion fechaEntrega estado moduloId tipoEntrega')
      .sort({ fechaEntrega: 1 })
      .lean();

    // Obtener eventos del curso
    const eventos = await Evento.find({
      cursosIds: cursoId,
      ...(Object.keys(filtroFechas).length > 0 && { fechaInicio: filtroFechas })
    })
      .select('titulo descripcion fechaInicio fechaFin hora ubicacion categoria estado')
      .sort({ fechaInicio: 1 })
      .lean();

    // Formatear tareas para el calendario
    const tareasCalendario = tareas.map(tarea => ({
      id: tarea._id,
      tipo: 'tarea',
      titulo: tarea.titulo,
      descripcion: tarea.descripcion,
      fecha: tarea.fechaEntrega,
      fechaInicio: tarea.fechaEntrega,
      fechaFin: tarea.fechaEntrega,
      estado: tarea.estado,
      modulo: tarea.moduloId?.titulo || 'Sin módulo',
      moduloId: tarea.moduloId?._id || null, // Agregar el ID del módulo
      tipoEntrega: tarea.tipoEntrega,
      color: obtenerColorTarea(tarea.estado, tarea.fechaEntrega),
      icono: 'assignment' // Para el frontend
    }));

    // Formatear eventos para el calendario
    const eventosCalendario = eventos.map(evento => ({
      id: evento._id,
      tipo: 'evento',
      titulo: evento.titulo,
      descripcion: evento.descripcion,
      fecha: evento.fechaInicio,
      fechaInicio: evento.fechaInicio,
      fechaFin: evento.fechaFin,
      hora: evento.hora,
      ubicacion: evento.ubicacion,
      categoria: evento.categoria,
      estado: evento.estado,
      color: obtenerColorEvento(evento.categoria),
      icono: obtenerIconoEvento(evento.categoria)
    }));

    // Combinar y ordenar por fecha
    const itemsCalendario = [...tareasCalendario, ...eventosCalendario]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Agrupar por fecha para facilitar renderizado
    const calendarioAgrupado = agruparPorFecha(itemsCalendario);

    res.status(200).json({
      success: true,
      curso: {
        id: curso._id,
        nombre: curso.nombre
      },
      items: itemsCalendario,
      itemsAgrupados: calendarioAgrupado,
      estadisticas: {
        totalTareas: tareasCalendario.length,
        totalEventos: eventosCalendario.length,
        tareasVencidas: tareasCalendario.filter(t => 
          t.estado === 'publicada' && new Date(t.fecha) < new Date()
        ).length,
        eventosProximos: eventosCalendario.filter(e => 
          e.estado === 'programado' && new Date(e.fechaInicio) > new Date()
        ).length
      }
    });

  } catch (error) {
    console.error('Error al obtener calendario:', error);
    res.status(500).json({ 
      error: 'Error al obtener el calendario del curso',
      details: error.message 
    });
  }
};

// Obtener eventos de un día específico
export const obtenerEventosDia = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { fecha } = req.query; // formato: YYYY-MM-DD

    if (!fecha) {
      return res.status(400).json({ 
        error: 'La fecha es requerida' 
      });
    }

    const inicioDia = new Date(fecha);
    inicioDia.setHours(0, 0, 0, 0);
    
    const finDia = new Date(fecha);
    finDia.setHours(23, 59, 59, 999);

    // Tareas del día
    const tareas = await Tarea.find({
      cursoId,
      fechaEntrega: { $gte: inicioDia, $lte: finDia }
    })
      .populate('moduloId', 'titulo')
      .populate('docenteId', 'nombre apellido')
      .lean();

    // Eventos del día
    const eventos = await Evento.find({
      cursosIds: cursoId,
      fechaInicio: { $lte: finDia },
      fechaFin: { $gte: inicioDia }
    })
      .populate('docenteId', 'nombre apellido')
      .lean();

    res.status(200).json({
      success: true,
      fecha,
      tareas: tareas.map(t => ({
        ...t,
        tipo: 'tarea',
        modulo: t.moduloId?.titulo || 'Sin módulo',
        color: obtenerColorTarea(t.estado, t.fechaEntrega)
      })),
      eventos: eventos.map(e => ({
        ...e,
        tipo: 'evento',
        color: obtenerColorEvento(e.categoria)
      }))
    });

  } catch (error) {
    console.error('Error al obtener eventos del día:', error);
    res.status(500).json({ 
      error: 'Error al obtener eventos del día',
      details: error.message 
    });
  }
};

// Obtener próximos eventos (tareas y eventos)
export const obtenerProximosEventos = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { limite = 10 } = req.query;

    const ahora = new Date();

    // Próximas tareas
    const tareas = await Tarea.find({
      cursoId,
      fechaEntrega: { $gte: ahora },
      estado: 'publicada'
    })
      .populate('moduloId', 'titulo')
      .sort({ fechaEntrega: 1 })
      .limit(parseInt(limite))
      .lean();

    // Próximos eventos
    const eventos = await Evento.find({
      cursosIds: cursoId,
      fechaInicio: { $gte: ahora },
      estado: { $in: ['programado', 'en_curso'] }
    })
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();

    // Combinar y ordenar
    const proximosEventos = [
      ...tareas.map(t => ({
        id: t._id,
        tipo: 'tarea',
        titulo: t.titulo,
        fecha: t.fechaEntrega,
        modulo: t.moduloId?.titulo || 'Sin módulo',
        moduloId: t.moduloId?._id || null
      })),
      ...eventos.map(e => ({
        id: e._id,
        tipo: 'evento',
        titulo: e.titulo,
        fecha: e.fechaInicio,
        categoria: e.categoria
      }))
    ]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(0, parseInt(limite));

    res.status(200).json({
      success: true,
      proximosEventos
    });

  } catch (error) {
    console.error('Error al obtener próximos eventos:', error);
    res.status(500).json({ 
      error: 'Error al obtener próximos eventos',
      details: error.message 
    });
  }
};

// Funciones auxiliares
function obtenerColorTarea(estado, fechaEntrega) {
  const ahora = new Date();
  const fecha = new Date(fechaEntrega);
  
  if (estado === 'cerrada') return '#9E9E9E'; // Gris
  if (fecha < ahora) return '#F44336'; // Rojo - vencida
  
  const diasRestantes = Math.ceil((fecha - ahora) / (1000 * 60 * 60 * 24));
  
  if (diasRestantes <= 2) return '#FF9800'; // Naranja - urgente
  if (diasRestantes <= 7) return '#FFC107'; // Amarillo - próxima
  return '#4CAF50'; // Verde - normal
}

function obtenerColorEvento(categoria) {
  const colores = {
    escuela_padres: '#2196F3', // Azul
    tarea: '#9C27B0', // Púrpura
    institucional: '#00BCD4' // Cian
  };
  return colores[categoria] || '#607D8B';
}

function obtenerIconoEvento(categoria) {
  const iconos = {
    escuela_padres: 'groups',
    tarea: 'assignment',
    institucional: 'school'
  };
  return iconos[categoria] || 'event';
}

function agruparPorFecha(items) {
  return items.reduce((grupos, item) => {
    const fecha = new Date(item.fecha).toISOString().split('T')[0];
    if (!grupos[fecha]) {
      grupos[fecha] = [];
    }
    grupos[fecha].push(item);
    return grupos;
  }, {});
}

// ─── Helpers de rol ──────────────────────────────────────────────────────────

async function obtenerCursosDelUsuario(userId, rol, institucionId) {
  switch (rol) {
    case 'docente':
      return Curso.find({ docenteId: userId }).select('_id nombre').lean();

    case 'padre':
      return Curso.find({
        'participantes.usuarioId': userId
      }).select('_id nombre').lean();

    case 'administrador':
      return Curso.find({ institucionId }).select('_id nombre').lean();

    case 'superadmin':
      return Curso.find({}).select('_id nombre').lean();

    default:
      return [];
  }
}

// ─── Calendario general del usuario autenticado ───────────────────────────────

export const obtenerCalendarioUsuario = async (req, res) => {
  try {
    const { userId, rol, institucionId } = req.user;
    const { mes, anio } = req.query;

    const cursos = await obtenerCursosDelUsuario(userId, rol, institucionId);

    if (!cursos.length) {
      return res.status(200).json({
        success: true,
        items: [],
        itemsAgrupados: {},
        estadisticas: { totalTareas: 0, totalEventos: 0, tareasVencidas: 0, eventosProximos: 0 }
      });
    }

    const cursosIds = cursos.map(c => c._id);
    const cursoMap = Object.fromEntries(cursos.map(c => [c._id.toString(), c.nombre]));

    let filtroFechas = {};
    if (mes && anio) {
      const inicioMes = new Date(anio, mes - 1, 1);
      const finMes = new Date(anio, mes, 0, 23, 59, 59);
      filtroFechas = { $gte: inicioMes, $lte: finMes };
    }

    const [tareas, eventos] = await Promise.all([
      Tarea.find({
        cursoId: { $in: cursosIds },
        ...(Object.keys(filtroFechas).length > 0 && { fechaEntrega: filtroFechas })
      })
        .populate('moduloId', 'titulo')
        .select('titulo descripcion fechaEntrega estado moduloId tipoEntrega cursoId')
        .sort({ fechaEntrega: 1 })
        .lean(),

      Evento.find({
        cursosIds: { $in: cursosIds },
        ...(Object.keys(filtroFechas).length > 0 && { fechaInicio: filtroFechas })
      })
        .select('titulo descripcion fechaInicio fechaFin hora ubicacion categoria estado cursosIds')
        .sort({ fechaInicio: 1 })
        .lean()
    ]);

    const tareasCalendario = tareas.map(tarea => ({
      id: tarea._id,
      tipo: 'tarea',
      titulo: tarea.titulo,
      descripcion: tarea.descripcion,
      fecha: tarea.fechaEntrega,
      fechaInicio: tarea.fechaEntrega,
      fechaFin: tarea.fechaEntrega,
      estado: tarea.estado,
      modulo: tarea.moduloId?.titulo || 'Sin módulo',
      moduloId: tarea.moduloId?._id || null,
      tipoEntrega: tarea.tipoEntrega,
      cursoId: tarea.cursoId,
      cursoNombre: cursoMap[tarea.cursoId?.toString()] || 'Sin curso',
      color: obtenerColorTarea(tarea.estado, tarea.fechaEntrega),
      icono: 'assignment'
    }));

    const eventosCalendario = eventos.map(evento => ({
      id: evento._id,
      tipo: 'evento',
      titulo: evento.titulo,
      descripcion: evento.descripcion,
      fecha: evento.fechaInicio,
      fechaInicio: evento.fechaInicio,
      fechaFin: evento.fechaFin,
      hora: evento.hora,
      ubicacion: evento.ubicacion,
      categoria: evento.categoria,
      estado: evento.estado,
      cursosIds: evento.cursosIds,
      cursosNombres: evento.cursosIds
        .map(id => cursoMap[id.toString()])
        .filter(Boolean),
      color: obtenerColorEvento(evento.categoria),
      icono: obtenerIconoEvento(evento.categoria)
    }));

    const itemsCalendario = [...tareasCalendario, ...eventosCalendario]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const ahora = new Date();

    res.status(200).json({
      success: true,
      usuario: { id: userId, rol },
      totalCursos: cursos.length,
      cursos,
      items: itemsCalendario,
      itemsAgrupados: agruparPorFecha(itemsCalendario),
      estadisticas: {
        totalTareas: tareasCalendario.length,
        totalEventos: eventosCalendario.length,
        tareasVencidas: tareasCalendario.filter(t =>
          t.estado === 'publicada' && new Date(t.fecha) < ahora
        ).length,
        eventosProximos: eventosCalendario.filter(e =>
          e.estado === 'programado' && new Date(e.fechaInicio) > ahora
        ).length
      }
    });

  } catch (error) {
    console.error('Error al obtener calendario:', error);
    res.status(500).json({
      error: 'Error al obtener el calendario',
      details: error.message
    });
  }
};

// ─── Próximos eventos del usuario autenticado ────────────────────────────────

export const obtenerProximosEventosUsuario = async (req, res) => {
  try {
    const { userId, rol, institucionId } = req.user;
    const { limite = 10 } = req.query;

    const cursos = await obtenerCursosDelUsuario(userId, rol, institucionId);

    if (!cursos.length) {
      return res.status(200).json({ success: true, proximosEventos: [] });
    }

    const cursosIds = cursos.map(c => c._id);
    const cursoMap = Object.fromEntries(cursos.map(c => [c._id.toString(), c.nombre]));
    const ahora = new Date();
    const limiteInt = parseInt(limite);

    const [tareas, eventos] = await Promise.all([
      Tarea.find({
        cursoId: { $in: cursosIds },
        fechaEntrega: { $gte: ahora },
        estado: 'publicada'
      })
        .populate('moduloId', 'titulo')
        .sort({ fechaEntrega: 1 })
        .limit(limiteInt)
        .lean(),

      Evento.find({
        cursosIds: { $in: cursosIds },
        fechaInicio: { $gte: ahora },
        estado: { $in: ['programado', 'en_curso'] }
      })
        .sort({ fechaInicio: 1 })
        .limit(limiteInt)
        .lean()
    ]);

    const proximosEventos = [
      ...tareas.map(t => ({
        id: t._id,
        tipo: 'tarea',
        titulo: t.titulo,
        fecha: t.fechaEntrega,
        modulo: t.moduloId?.titulo || 'Sin módulo',
        moduloId: t.moduloId?._id || null,
        cursoId: t.cursoId,
        cursoNombre: cursoMap[t.cursoId?.toString()] || 'Sin curso'
      })),
      ...eventos.map(e => ({
        id: e._id,
        tipo: 'evento',
        titulo: e.titulo,
        fecha: e.fechaInicio,
        categoria: e.categoria,
        cursosNombres: e.cursosIds.map(id => cursoMap[id.toString()]).filter(Boolean)
      }))
    ]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(0, limiteInt);

    res.status(200).json({ success: true, proximosEventos });

  } catch (error) {
    console.error('Error al obtener próximos eventos:', error);
    res.status(500).json({
      error: 'Error al obtener próximos eventos',
      details: error.message
    });
  }
};