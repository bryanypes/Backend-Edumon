import Foro from '../models/Foro.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import MensajeForo from '../models/MensajeForo.js'; 
import mongoose from 'mongoose';  

const TIPOS_ARCHIVO_PERMITIDOS = {
  'image/jpeg': 'imagen',
  'image/jpg': 'imagen',
  'image/png': 'imagen',
  'image/gif': 'imagen',
  'image/webp': 'imagen',
  'video/mp4': 'video',
  'video/quicktime': 'video', // MOV
  'video/x-msvideo': 'video', // AVI
  'application/pdf': 'pdf'
};

const TAMANO_MAX_ARCHIVO = {
  imagen: 5 * 1024 * 1024,    // 5 MB
  video: 50 * 1024 * 1024,    // 50 MB
  pdf: 10 * 1024 * 1024       // 10 MB
};

const procesarArchivosAdjuntos = async (files) => {
  const archivos = [];
  const errores = [];

  if (!files || files.length === 0) {
    return { archivos, errores };
  }

  for (const file of files) {
    try {
      const tipo = TIPOS_ARCHIVO_PERMITIDOS[file.mimetype];
      if (!tipo) {
        errores.push({
          archivo: file.originalname,
          error: `Tipo de archivo no permitido: ${file.mimetype}`
        });
        continue;
      }

      const tamanoMax = TAMANO_MAX_ARCHIVO[tipo];
      if (file.size > tamanoMax) {
        errores.push({
          archivo: file.originalname,
          error: `Archivo demasiado grande. Máximo: ${tamanoMax / (1024 * 1024)} MB`
        });
        continue;
      }

      const resultado = await subirArchivoCloudinary(file.buffer, file.mimetype, 'foros', file.originalname);

      archivos.push({
        url: resultado.url,
        publicId: resultado.publicId,
        tipo: tipo,
        nombre: file.originalname,
        tamano: file.size
      });

    } catch (error) {
      console.error(`Error procesando ${file.originalname}:`, error);
      errores.push({
        archivo: file.originalname,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined || 'Error al subir el archivo'
      });
    }
  }

  return { archivos, errores };
};

// Crear foro
export const crearForo = async (req, res) => {
  try {
    const { titulo, descripcion, cursoId, publico } = req.body;
    const docenteId = req.user.userId;

    // Validaciones básicas
    if (!titulo || !descripcion || !cursoId) {
      return res.status(400).json({ 
        message: 'Faltan campos requeridos: titulo, descripcion, cursoId' 
      });
    }

    const curso = await Curso.findById(cursoId);

    if (!curso) {
      return res.status(404).json({ message: 'Curso no encontrado' });
    }

    // "administrador" antes tenía bypass total (sin importar la institución del curso);
    // ahora solo puede crear foros en cursos de su propia institución.
    if (req.user.rol === 'docente' && curso.docenteId.toString() !== docenteId) {
      return res.status(403).json({
        message: 'No tienes permisos para crear foros en este curso'
      });
    }
    if (req.user.rol === 'administrador' && curso.institucionId.toString() !== req.user.institucionId) {
      return res.status(403).json({
        message: 'No tienes permisos para crear foros en este curso'
      });
    }

    const { archivos, errores } = await procesarArchivosAdjuntos(req.files);

    const nuevoForo = new Foro({
      titulo,
      descripcion,
      docenteId,
      cursoId,
      archivos,
      publico: publico || false
    });

    await nuevoForo.save();

    await nuevoForo.populate([
      { path: 'docenteId', select: 'nombre apellido fotoPerfilUrl rol' },
      { path: 'cursoId', select: 'nombre' }
    ]);

    const respuesta = {
      message: 'Foro creado exitosamente',
      foro: nuevoForo
    };

    if (errores.length > 0) {
      respuesta.advertencias = {
        message: `${errores.length} archivo(s) no pudieron ser procesados`,
        detalles: errores
      };
    }

    if (archivos.length > 0) {
      respuesta.archivosSubidos = {
        total: archivos.length,
        tipos: {
          imagenes: archivos.filter(a => a.tipo === 'imagen').length,
          videos: archivos.filter(a => a.tipo === 'video').length,
          pdfs: archivos.filter(a => a.tipo === 'pdf').length
        }
      };
    }

    res.status(201).json(respuesta);

  } catch (error) {
    console.error(' Error al crear foro:', error);
    res.status(500).json({ 
      message: 'Error al crear el foro', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obtener foros de un curso
export const obtenerForosPorCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const usuarioId = req.user.userId;

    const curso = await Curso.findById(cursoId);

    if (!curso) {
      return res.status(404).json({ message: 'Curso no encontrado' });
    }

    const esDocenteDelCurso = curso.docenteId.toString() === usuarioId;
    const esParticipante = curso.esParticipante(usuarioId);
    const esAdministradorDeLaInstitucion = req.user.rol === 'administrador' &&
      curso.institucionId.toString() === req.user.institucionId;

    if (!esDocenteDelCurso && !esParticipante && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes acceso a este curso' });
    }

    const foros = await Foro.find({ cursoId })
      .populate('docenteId', 'nombre apellido fotoPerfilUrl rol')
      .populate('cursoId', 'nombre')
      .populate('totalMensajes')
      .sort({ fechaCreacion: -1 });

    res.status(200).json({ foros });

  } catch (error) {
    console.error('Error al obtener foros:', error);
    res.status(500).json({ message: 'Error al obtener los foros', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// Obtener un foro por ID
export const obtenerForoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    const foro = await Foro.findById(id)
      .populate('docenteId', 'nombre apellido fotoPerfilUrl rol')
      .populate('cursoId', 'nombre institucionId')
      .populate('totalMensajes');

    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    const esAdministradorDeLaInstitucion = req.user.rol === 'administrador' &&
      foro.cursoId.institucionId?.toString() === req.user.institucionId;

    if (!tieneAcceso && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    res.status(200).json({ foro });

  } catch (error) {
    console.error('Error al obtener foro:', error);
    res.status(500).json({ message: 'Error al obtener el foro', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// Actualizar foro
export const actualizarForo = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, estado, publico } = req.body;
    const usuarioId = req.user.userId;

    const foro = await Foro.findById(id);
    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    // Verificar permisos
    const esCreador = foro.docenteId.toString() === usuarioId;
    const esAdministradorDeLaInstitucion = !esCreador && req.user.rol === 'administrador' &&
      (await Curso.findById(foro.cursoId).select('institucionId'))?.institucionId?.toString() === req.user.institucionId;

    if (!esCreador && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes permisos para actualizar este foro' });
    }

    // Actualizar campos
    if (titulo) foro.titulo = titulo;
    if (descripcion) foro.descripcion = descripcion;
    if (estado) foro.estado = estado;
    if (publico !== undefined) foro.publico = publico;

    await foro.save();
    await foro.populate([
      { path: 'docenteId', select: 'nombre apellido fotoPerfilUrl rol' },
      { path: 'cursoId', select: 'nombre' }
    ]);

    res.status(200).json({
      message: 'Foro actualizado exitosamente',
      foro
    });

  } catch (error) {
    console.error('Error al actualizar foro:', error);
    res.status(500).json({ message: 'Error al actualizar el foro', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// Eliminar foro
export const eliminarForo = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    const foro = await Foro.findById(id);
    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    // Verificar permisos
    const esCreador = foro.docenteId.toString() === usuarioId;
    const esAdministradorDeLaInstitucion = !esCreador && req.user.rol === 'administrador' &&
      (await Curso.findById(foro.cursoId).select('institucionId'))?.institucionId?.toString() === req.user.institucionId;

    if (!esCreador && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes permisos para eliminar este foro' });
    }

    const mensajes = await mongoose.model('MensajeForo').find({ foroId: id });

    const archivosAEliminar = [
      ...(foro.archivos || []),
      ...mensajes.flatMap(m => m.archivos || [])
    ];

    await Promise.all(archivosAEliminar.map(archivo => {
      const resourceType = archivo.tipo === 'video' ? 'video' :
                         archivo.tipo === 'pdf' ? 'raw' : 'image';
      return eliminarArchivoCloudinary(archivo.publicId, resourceType);
    }));

    await mongoose.model('MensajeForo').deleteMany({ foroId: id });
    await Foro.findByIdAndDelete(id);

    res.status(200).json({ message: 'Foro eliminado exitosamente' });

  } catch (error) {
    console.error('Error al eliminar foro:', error);
    res.status(500).json({ message: 'Error al eliminar el foro', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// Cambiar estado del foro (abrir/cerrar)
export const cambiarEstadoForo = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const usuarioId = req.user.userId;

    if (!['abierto', 'cerrado'].includes(estado)) {
      return res.status(400).json({ 
        message: 'Estado inválido. Debe ser "abierto" o "cerrado"' 
      });
    }

    const foro = await Foro.findById(id);
    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    // Verificar permisos
    const esCreador = foro.docenteId.toString() === usuarioId;
    const esAdministradorDeLaInstitucion = !esCreador && req.user.rol === 'administrador' &&
      (await Curso.findById(foro.cursoId).select('institucionId'))?.institucionId?.toString() === req.user.institucionId;

    if (!esCreador && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes permisos para cambiar el estado' });
    }

    foro.estado = estado;
    await foro.save();

    res.status(200).json({
      message: `Foro ${estado === 'cerrado' ? 'cerrado' : 'abierto'} exitosamente`,
      foro
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({ message: 'Error al cambiar el estado', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// GET /foros/:id/dashboard
// Devuelve foro + mensajes recientes + participantes activos + estadísticas + actividad
// NO reemplaza las APIs separadas — solo optimiza UX con un solo fetch
export const getDashboardForo = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    // ── 1. Verificar que el foro existe y el usuario tiene acceso ──────────────
    const foro = await Foro.findById(id)
      .populate('docenteId', 'nombre apellido fotoPerfilUrl rol')
      .populate('cursoId', 'nombre institucionId')
      .populate('totalMensajes');

    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    const esAdministradorDeLaInstitucion = req.user.rol === 'administrador' &&
      foro.cursoId.institucionId?.toString() === req.user.institucionId;

    if (!tieneAcceso && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    // ── 2. Lanzar todas las queries en paralelo ────────────────────────────────
    const [mensajesRecientes, todosLosMensajes] = await Promise.all([
      // Últimos 10 mensajes raíz (sin respuestas) con autor
      MensajeForo.find({ foroId: id, respuestaA: null })
        .sort({ fechaCreacion: -1 })
        .limit(10)
        .populate('usuarioId', 'nombre apellido fotoPerfilUrl rol')
        .lean(),

      // Todos los mensajes para calcular estadísticas y actividad
      MensajeForo.find({ foroId: id }).lean()
    ]);

    // ── 3. Participantes activos ───────────────────────────────────────────────
    // Usuarios únicos que han publicado al menos un mensaje
    const mapaParticipantes = new Map();

    for (const msg of todosLosMensajes) {
      const uid = msg.usuarioId.toString();
      if (!mapaParticipantes.has(uid)) {
        mapaParticipantes.set(uid, {
          usuarioId: uid,
          totalMensajes: 0,
          ultimaActividad: msg.fechaCreacion
        });
      }
      const p = mapaParticipantes.get(uid);
      p.totalMensajes += 1;
      if (msg.fechaCreacion > p.ultimaActividad) {
        p.ultimaActividad = msg.fechaCreacion;
      }
    }

    // Poblar datos de usuario para los participantes
    const idsParticipantes = [...mapaParticipantes.keys()].map(
      id => new mongoose.Types.ObjectId(id)
    );

    const usuariosParticipantes = await User.find(
      { _id: { $in: idsParticipantes } },
      'nombre apellido fotoPerfilUrl rol'
    ).lean();

    const participantesActivos = usuariosParticipantes
      .map(u => ({
        ...u,
        totalMensajes: mapaParticipantes.get(u._id.toString()).totalMensajes,
        ultimaActividad: mapaParticipantes.get(u._id.toString()).ultimaActividad
      }))
      .sort((a, b) => b.totalMensajes - a.totalMensajes)
      .slice(0, 10); // Top 10

    // ── 4. Estadísticas ───────────────────────────────────────────────────────
    const totalMensajes = todosLosMensajes.length;
    const totalRespuestas = todosLosMensajes.filter(m => m.respuestaA !== null).length;
    const totalRaiz = totalMensajes - totalRespuestas;
    const totalLikes = todosLosMensajes.reduce((sum, m) => sum + (m.likes || 0), 0);

    const estadisticas = {
      totalMensajes,
      totalMensajesRaiz: totalRaiz,
      totalRespuestas,
      totalParticipantes: mapaParticipantes.size,
      totalLikes,
      promedioRespuestasPorMensaje: totalRaiz > 0
        ? parseFloat((totalRespuestas / totalRaiz).toFixed(2))
        : 0
    };

    // ── 5. Actividad por día (últimos 7 días) ─────────────────────────────────
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 6);
    hace7Dias.setHours(0, 0, 0, 0);

    const mapaActividad = {};
    for (let i = 0; i < 7; i++) {
      const fecha = new Date(hace7Dias);
      fecha.setDate(hace7Dias.getDate() + i);
      const key = fecha.toISOString().split('T')[0]; // 'YYYY-MM-DD'
      mapaActividad[key] = 0;
    }

    for (const msg of todosLosMensajes) {
      const fechaMsg = new Date(msg.fechaCreacion);
      if (fechaMsg >= hace7Dias) {
        const key = fechaMsg.toISOString().split('T')[0];
        if (mapaActividad[key] !== undefined) {
          mapaActividad[key] += 1;
        }
      }
    }

    const actividad = Object.entries(mapaActividad).map(([fecha, mensajes]) => ({
      fecha,
      mensajes
    }));

    // ── 6. Respuesta ──────────────────────────────────────────────────────────
    res.status(200).json({
      foro,
      mensajesRecientes,
      participantesActivos,
      estadisticas,
      actividad
    });

  } catch (error) {
    console.error('Error al obtener dashboard del foro:', error);
    res.status(500).json({
      message: 'Error al obtener el dashboard del foro',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};