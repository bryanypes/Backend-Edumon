import Tarea from '../models/Tarea.js';
import Evento from '../models/Evento.js';
import Curso from '../models/Curso.js';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function formatearDocente(docenteId) {
  if (!docenteId) return null;
  return {
    id: docenteId._id,
    nombre: docenteId.nombre,
    apellido: docenteId.apellido,
    correo: docenteId.correo,
    nombreCompleto: `${docenteId.nombre} ${docenteId.apellido}`
  };
}

function formatearCurso(curso) {
  return {
    id: curso._id,
    nombre: curso.nombre,
    docente: formatearDocente(curso.docenteId)
  };
}

function obtenerColorTarea(estado, fechaEntrega) {
  const ahora = new Date();
  const fecha = new Date(fechaEntrega);
  if (estado === 'cerrada') return '#9E9E9E';
  if (fecha < ahora) return '#F44336';
  const diasRestantes = Math.ceil((fecha - ahora) / (1000 * 60 * 60 * 24));
  if (diasRestantes <= 2) return '#FF9800';
  if (diasRestantes <= 7) return '#FFC107';
  return '#4CAF50';
}

function obtenerColorEvento(categoria) {
  const colores = {
    escuela_padres: '#2196F3',
    tarea: '#9C27B0',
    institucional: '#00BCD4'
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
    if (!grupos[fecha]) grupos[fecha] = [];
    grupos[fecha].push(item);
    return grupos;
  }, {});
}

// ─── 1. CALENDARIO DE UN CURSO ───────────────────────────────────────────────

export const obtenerCalendarioCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { mes, anio } = req.query;

    const curso = await Curso.findById(cursoId)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    let filtroFechas = {};
    if (mes && anio) {
      const inicioMes = new Date(anio, mes - 1, 1);
      const finMes = new Date(anio, mes, 0, 23, 59, 59);
      filtroFechas = { $gte: inicioMes, $lte: finMes };
    }

    const tareas = await Tarea.find({
      cursoId,
      ...(Object.keys(filtroFechas).length > 0 && { fechaEntrega: filtroFechas })
    })
      .populate('moduloId', 'titulo')
      .select('titulo descripcion fechaEntrega estado moduloId tipoEntrega')
      .sort({ fechaEntrega: 1 })
      .lean();

    const eventos = await Evento.find({
      cursosIds: cursoId,
      ...(Object.keys(filtroFechas).length > 0 && { fechaInicio: filtroFechas })
    })
      .select('titulo descripcion fechaInicio fechaFin hora ubicacion categoria estado')
      .sort({ fechaInicio: 1 })
      .lean();

    const cursoInfo = formatearCurso(curso);

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
      curso: cursoInfo,
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
      curso: cursoInfo,
      color: obtenerColorEvento(evento.categoria),
      icono: obtenerIconoEvento(evento.categoria)
    }));

    const itemsCalendario = [...tareasCalendario, ...eventosCalendario]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    res.status(200).json({
      success: true,
      curso: cursoInfo,
      items: itemsCalendario,
      itemsAgrupados: agruparPorFecha(itemsCalendario),
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
    res.status(500).json({ error: 'Error al obtener el calendario del curso', details: error.message });
  }
};

// ─── 2. EVENTOS DE UN DÍA ESPECÍFICO ────────────────────────────────────────

export const obtenerEventosDia = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { fecha } = req.query;

    if (!fecha) {
      return res.status(400).json({ error: 'La fecha es requerida' });
    }

    const curso = await Curso.findById(cursoId)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const inicioDia = new Date(fecha);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setHours(23, 59, 59, 999);

    const tareas = await Tarea.find({
      cursoId,
      fechaEntrega: { $gte: inicioDia, $lte: finDia }
    })
      .populate('moduloId', 'titulo')
      .lean();

    const eventos = await Evento.find({
      cursosIds: cursoId,
      fechaInicio: { $lte: finDia },
      fechaFin: { $gte: inicioDia }
    }).lean();

    const cursoInfo = formatearCurso(curso);

    res.status(200).json({
      success: true,
      fecha,
      curso: cursoInfo,
      tareas: tareas.map(t => ({
        ...t,
        tipo: 'tarea',
        modulo: t.moduloId?.titulo || 'Sin módulo',
        curso: cursoInfo,
        color: obtenerColorTarea(t.estado, t.fechaEntrega)
      })),
      eventos: eventos.map(e => ({
        ...e,
        tipo: 'evento',
        curso: cursoInfo,
        color: obtenerColorEvento(e.categoria)
      }))
    });

  } catch (error) {
    console.error('Error al obtener eventos del día:', error);
    res.status(500).json({ error: 'Error al obtener eventos del día', details: error.message });
  }
};

// ─── 3. PRÓXIMOS EVENTOS DE UN CURSO ────────────────────────────────────────

export const obtenerProximosEventos = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { limite = 10 } = req.query;

    const curso = await Curso.findById(cursoId)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const ahora = new Date();
    const cursoInfo = formatearCurso(curso);

    const tareas = await Tarea.find({
      cursoId,
      fechaEntrega: { $gte: ahora },
      estado: 'publicada'
    })
      .populate('moduloId', 'titulo')
      .sort({ fechaEntrega: 1 })
      .limit(parseInt(limite))
      .lean();

    const eventos = await Evento.find({
      cursosIds: cursoId,
      fechaInicio: { $gte: ahora },
      estado: { $in: ['programado', 'en_curso'] }
    })
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();

    const proximosEventos = [
      ...tareas.map(t => ({
        id: t._id,
        tipo: 'tarea',
        titulo: t.titulo,
        fecha: t.fechaEntrega,
        modulo: t.moduloId?.titulo || 'Sin módulo',
        moduloId: t.moduloId?._id || null,
        curso: cursoInfo
      })),
      ...eventos.map(e => ({
        id: e._id,
        tipo: 'evento',
        titulo: e.titulo,
        fecha: e.fechaInicio,
        categoria: e.categoria,
        curso: cursoInfo
      }))
    ]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(0, parseInt(limite));

    res.status(200).json({ success: true, proximosEventos });

  } catch (error) {
    console.error('Error al obtener próximos eventos:', error);
    res.status(500).json({ error: 'Error al obtener próximos eventos', details: error.message });
  }
};

// ─── 4. CALENDARIO GENERAL DEL DOCENTE (todos sus cursos) ───────────────────

export const obtenerCalendarioDocente = async (req, res) => {
  try {
    const docenteId = req.user._id;
    const { mes, anio } = req.query;

    const cursos = await Curso.find({ docenteId })
      .select('_id nombre docenteId')
      .populate('docenteId', 'nombre apellido correo')
      .lean();

    if (!cursos.length) {
      return res.status(200).json({
        success: true,
        items: [],
        itemsAgrupados: {},
        estadisticas: { totalTareas: 0, totalEventos: 0, tareasVencidas: 0, eventosProximos: 0 }
      });
    }

    const cursosIds = cursos.map(c => c._id);
    const cursoMap = Object.fromEntries(
      cursos.map(c => [c._id.toString(), formatearCurso(c)])
    );

    let filtroFechas = {};
    if (mes && anio) {
      const inicioMes = new Date(anio, mes - 1, 1);
      const finMes = new Date(anio, mes, 0, 23, 59, 59);
      filtroFechas = { $gte: inicioMes, $lte: finMes };
    }

    const tareas = await Tarea.find({
      cursoId: { $in: cursosIds },
      ...(Object.keys(filtroFechas).length > 0 && { fechaEntrega: filtroFechas })
    })
      .populate('moduloId', 'titulo')
      .select('titulo descripcion fechaEntrega estado moduloId tipoEntrega cursoId')
      .sort({ fechaEntrega: 1 })
      .lean();

    const eventos = await Evento.find({
      cursosIds: { $in: cursosIds },
      ...(Object.keys(filtroFechas).length > 0 && { fechaInicio: filtroFechas })
    })
      .select('titulo descripcion fechaInicio fechaFin hora ubicacion categoria estado cursosIds')
      .sort({ fechaInicio: 1 })
      .lean();

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
      curso: cursoMap[tarea.cursoId?.toString()] || null,
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
      cursos: evento.cursosIds
        .map(id => cursoMap[id.toString()])
        .filter(Boolean),
      color: obtenerColorEvento(evento.categoria),
      icono: obtenerIconoEvento(evento.categoria)
    }));

    const itemsCalendario = [...tareasCalendario, ...eventosCalendario]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    res.status(200).json({
      success: true,
      docente: formatearDocente(cursos[0].docenteId),
      totalCursos: cursos.length,
      cursos: cursos.map(c => formatearCurso(c)),
      items: itemsCalendario,
      itemsAgrupados: agruparPorFecha(itemsCalendario),
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
    console.error('Error al obtener calendario del docente:', error);
    res.status(500).json({ error: 'Error al obtener el calendario del docente', details: error.message });
  }
};

// ─── 5. PRÓXIMOS EVENTOS DEL DOCENTE (todos sus cursos) ─────────────────────

export const obtenerProximosEventosDocente = async (req, res) => {
  try {
    const docenteId = req.user._id;
    const { limite = 10 } = req.query;

    const cursos = await Curso.find({ docenteId })
      .select('_id nombre docenteId')
      .populate('docenteId', 'nombre apellido correo')
      .lean();

    if (!cursos.length) {
      return res.status(200).json({ success: true, proximosEventos: [] });
    }

    const cursosIds = cursos.map(c => c._id);
    const cursoMap = Object.fromEntries(
      cursos.map(c => [c._id.toString(), formatearCurso(c)])
    );

    const ahora = new Date();

    const tareas = await Tarea.find({
      cursoId: { $in: cursosIds },
      fechaEntrega: { $gte: ahora },
      estado: 'publicada'
    })
      .populate('moduloId', 'titulo')
      .sort({ fechaEntrega: 1 })
      .limit(parseInt(limite))
      .lean();

    const eventos = await Evento.find({
      cursosIds: { $in: cursosIds },
      fechaInicio: { $gte: ahora },
      estado: { $in: ['programado', 'en_curso'] }
    })
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();

    const proximosEventos = [
      ...tareas.map(t => ({
        id: t._id,
        tipo: 'tarea',
        titulo: t.titulo,
        fecha: t.fechaEntrega,
        modulo: t.moduloId?.titulo || 'Sin módulo',
        moduloId: t.moduloId?._id || null,
        curso: cursoMap[t.cursoId?.toString()] || null
      })),
      ...eventos.map(e => ({
        id: e._id,
        tipo: 'evento',
        titulo: e.titulo,
        fecha: e.fechaInicio,
        categoria: e.categoria,
        cursos: e.cursosIds
          .map(id => cursoMap[id.toString()])
          .filter(Boolean)
      }))
    ]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(0, parseInt(limite));

    res.status(200).json({ success: true, proximosEventos });

  } catch (error) {
    console.error('Error al obtener próximos eventos del docente:', error);
    res.status(500).json({ error: 'Error al obtener próximos eventos del docente', details: error.message });
  }
};