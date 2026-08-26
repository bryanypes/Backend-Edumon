import MensajeForo from '../models/MensajeForo.js';
import Foro from '../models/Foro.js';
import User from '../models/User.js';
import Curso from '../models/Curso.js';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { getFileBuffer } from '../utils/fileUploadHelper.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';

const TIPOS_ARCHIVO_PERMITIDOS = {
  'image/jpeg': 'imagen',
  'image/jpg': 'imagen',
  'image/png': 'imagen',
  'image/gif': 'imagen',
  'image/webp': 'imagen',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
  'application/pdf': 'pdf'
};

const TAMANO_MAX_ARCHIVO = {
  imagen: 5 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  pdf: 10 * 1024 * 1024
};

const procesarArchivosAdjuntos = async (files, carpeta = 'mensajes-foro') => {
  const archivos = [];
  const errores = [];

  if (!files || files.length === 0) return { archivos, errores };

  for (const file of files) {
    try {
      const tipo = TIPOS_ARCHIVO_PERMITIDOS[file.mimetype];
      if (!tipo) {
        errores.push({ archivo: file.originalname, error: `Tipo no permitido: ${file.mimetype}` });
        continue;
      }

      if (file.size > TAMANO_MAX_ARCHIVO[tipo]) {
        errores.push({ archivo: file.originalname, error: `Tamaño máximo: ${TAMANO_MAX_ARCHIVO[tipo] / (1024 * 1024)} MB` });
        continue;
      }

      const fileBuffer = await getFileBuffer(file);
      if (!fileBuffer) {
        throw new Error(`No se pudo leer el archivo ${file.originalname}`);
      }

      const resultado = await subirArchivoCloudinary(fileBuffer, file.mimetype, carpeta, file.originalname);
      archivos.push({
        url: resultado.url,
        publicId: resultado.publicId,
        tipo,
        nombre: file.originalname,
        tamano: file.size
      });
    } catch (error) {
      console.error(`Error procesando ${file.originalname}:`, error);
      errores.push({ archivo: file.originalname, error: error.message });
    }
  }

  return { archivos, errores };
};

// Crear mensaje
export const crearMensaje = async (req, res) => {
  try {
    const { foroId, contenido, respuestaA } = req.body;
    const usuarioId = req.user.userId;

    if (!foroId || !contenido?.trim()) {
      return res.status(400).json({ message: 'El contenido del mensaje es requerido' });
    }

    const foro = await Foro.findById(foroId);
    if (!foro) return res.status(404).json({ message: 'Foro no encontrado' });

    if (!foro.estaAbierto()) return res.status(403).json({ message: 'El foro está cerrado' });

    // "administrador" antes tenía bypass total sin importar la institución del curso
    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    let esAdministradorDeLaInstitucion = false;
    if (!tieneAcceso && req.user.rol === 'administrador') {
      const cursoDelForo = await Curso.findById(foro.cursoId).select('institucionId');
      esAdministradorDeLaInstitucion = cursoDelForo?.institucionId?.toString() === req.user.institucionId;
    }

    if (!tieneAcceso && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    if (respuestaA) {
      const mensajeOriginal = await MensajeForo.findById(respuestaA);
      if (!mensajeOriginal) return res.status(404).json({ message: 'Mensaje original no encontrado' });

      if (mensajeOriginal.respuestaA) {
        return res.status(400).json({ message: 'Solo puedes responder directamente al foro' });
      }

      if (req.user.rol === 'padre') {
        const usuarioOriginal = await User.findById(mensajeOriginal.usuarioId);
        if (!['docente', 'administrador'].includes(usuarioOriginal.rol)) {
          return res.status(403).json({ message: 'Los padres solo pueden responder a mensajes de docentes' });
        }
      }
    }

    const { archivos, errores } = await procesarArchivosAdjuntos(req.files);

    const nuevoMensaje = new MensajeForo({
      foroId,
      usuarioId,
      contenido: contenido.trim(),
      archivos,
      respuestaA: respuestaA || null
    });

    await nuevoMensaje.save();
    await nuevoMensaje.populate('usuarioId', 'nombre apellido fotoPerfilUrl rol');

    // Notificar: siempre en mensajes raíz; en respuestas, solo si quien
    // responde es el docente (evita saturar a todo el curso con cada
    // respuesta entre padres, pero un padre sí debe enterarse si el docente
    // le responde).
    const esRespuesta = Boolean(nuevoMensaje.respuestaA);
    const autorEsDocente = nuevoMensaje.usuarioId.rol === 'docente';
    if (!esRespuesta || autorEsDocente) {
      eventBus.publicar(EVENTOS.FORO_NUEVO_MENSAJE, { mensaje: nuevoMensaje, foro });
    }

    const respuesta = { message: 'Mensaje creado exitosamente', mensaje: nuevoMensaje };
    if (errores.length > 0) {
      respuesta.advertencias = { message: `${errores.length} archivo(s) no procesados`, detalles: errores };
    }
    if (archivos.length > 0) respuesta.archivosSubidos = archivos.length;

    res.status(201).json(respuesta);
  } catch (error) {
    console.error('Error al crear mensaje:', error);
    res.status(500).json({ message: 'Error al crear el mensaje', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// Obtener mensajes de un foro
export const obtenerMensajesPorForo = async (req, res) => {
  try {
    const { foroId } = req.params;
    const usuarioId = req.user.userId;

    const foro = await Foro.findById(foroId);
    if (!foro) return res.status(404).json({ message: 'Foro no encontrado' });

    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    let esAdministradorDeLaInstitucion = false;
    if (!tieneAcceso && req.user.rol === 'administrador') {
      const cursoDelForo = await Curso.findById(foro.cursoId).select('institucionId');
      esAdministradorDeLaInstitucion = cursoDelForo?.institucionId?.toString() === req.user.institucionId;
    }

    if (!tieneAcceso && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    const mensajes = await MensajeForo.find({ foroId, respuestaA: null })
      .populate('usuarioId', 'nombre apellido fotoPerfilUrl rol')
      .sort({ fechaCreacion: 1 })
      .lean();

    // Traer todas las respuestas en una sola consulta en vez de una por mensaje raíz
    const todasLasRespuestas = mensajes.length > 0
      ? await MensajeForo.find({ foroId, respuestaA: { $in: mensajes.map(m => m._id) } })
          .populate('usuarioId', 'nombre apellido fotoPerfilUrl rol')
          .sort({ fechaCreacion: 1 })
          .lean()
      : [];

    const respuestasPorMensaje = new Map();
    for (const respuesta of todasLasRespuestas) {
      const key = respuesta.respuestaA.toString();
      if (!respuestasPorMensaje.has(key)) respuestasPorMensaje.set(key, []);
      respuestasPorMensaje.get(key).push(respuesta);
    }

    const mensajesConRespuestas = mensajes.map(mensaje => ({
      ...mensaje,
      respuestas: respuestasPorMensaje.get(mensaje._id.toString()) || []
    }));

    res.status(200).json({ mensajes: mensajesConRespuestas });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({ message: 'Error al obtener los mensajes' });
  }
};

// Toggle like
export const toggleLikeMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    const mensaje = await MensajeForo.findById(id);
    if (!mensaje) return res.status(404).json({ message: 'Mensaje no encontrado' });

    const foro = await Foro.findById(mensaje.foroId);
    if (!foro) return res.status(404).json({ message: 'Foro no encontrado' });

    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    let esAdministradorDeLaInstitucion = false;
    if (!tieneAcceso && req.user.rol === 'administrador') {
      const cursoDelForo = await Curso.findById(foro.cursoId).select('institucionId');
      esAdministradorDeLaInstitucion = cursoDelForo?.institucionId?.toString() === req.user.institucionId;
    }

    if (!tieneAcceso && !esAdministradorDeLaInstitucion) {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    mensaje.toggleLike(usuarioId);
    await mensaje.save();

    res.status(200).json({
      message: 'Like actualizado',
      likes: mensaje.likes,
      yaLeDioLike: mensaje.yaLeDioLike(usuarioId)
    });
  } catch (error) {
    console.error('Error al dar like:', error);
    res.status(500).json({ message: 'Error al actualizar like' });
  }
};

/**
 * Eliminar mensaje
 *
 * Permisos:
 *  - El autor siempre puede eliminar su propio mensaje
 *  - Administrador puede eliminar cualquier mensaje
 *  - Docente puede eliminar mensajes de padres en foros de sus cursos
 *    (moderación por contenido ofensivo u inapropiado)
 *  - Docente NO puede eliminar mensajes de otros docentes ni administradores
 */
export const eliminarMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    const mensaje = await MensajeForo.findById(id);
    if (!mensaje) return res.status(404).json({ message: 'Mensaje no encontrado' });

    const esAutor = mensaje.usuarioId.toString() === usuarioId;

    let puedeEliminar = esAutor;

    // Administrador: solo puede moderar mensajes de foros de su propia institución
    if (!puedeEliminar && req.user.rol === 'administrador') {
      const foroDelMensaje = await Foro.findById(mensaje.foroId);
      const cursoDelForo = foroDelMensaje && await Curso.findById(foroDelMensaje.cursoId).select('institucionId');
      if (cursoDelForo?.institucionId?.toString() === req.user.institucionId) {
        puedeEliminar = true;
      }
    }

    // Docente: puede moderar mensajes de padres en sus foros
    if (!puedeEliminar && req.user.rol === 'docente') {
      const autorMensaje = await User.findById(mensaje.usuarioId).select('rol');

      // Solo puede eliminar mensajes de padres (no de otros docentes)
      if (autorMensaje?.rol === 'padre') {
        const foro = await Foro.findById(mensaje.foroId);
        // El foro debe pertenecer a un curso del propio docente para poder moderar
        const cursoDelDocente = foro && await Curso.findOne({
          _id: foro.cursoId,
          docenteId: usuarioId
        });

        if (cursoDelDocente) {
          puedeEliminar = true;
        }
      }
    }

    if (!puedeEliminar) {
      return res.status(403).json({
        message: 'No tienes permisos para eliminar este mensaje'
      });
    }

    const respuestas = await MensajeForo.find({ respuestaA: id });

    const archivosAEliminar = [
      ...(mensaje.archivos || []),
      ...respuestas.flatMap(r => r.archivos || [])
    ];

    await Promise.all(archivosAEliminar.map(archivo => {
      const resourceType = archivo.tipo === 'video' ? 'video' : archivo.tipo === 'pdf' ? 'raw' : 'image';
      return eliminarArchivoCloudinary(archivo.publicId, resourceType).catch(e =>
        console.error(`Error eliminando archivo ${archivo.publicId}:`, e.message)
      );
    }));

    await MensajeForo.deleteMany({ respuestaA: id });
    await MensajeForo.findByIdAndDelete(id);

    res.status(200).json({ message: 'Mensaje eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar mensaje:', error);
    res.status(500).json({ message: 'Error al eliminar el mensaje' });
  }
};

// Actualizar mensaje
export const actualizarMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const { contenido } = req.body;
    const usuarioId = req.user.userId;

    if (!contenido?.trim()) {
      return res.status(400).json({ message: 'El contenido no puede estar vacío' });
    }

    const mensaje = await MensajeForo.findById(id);
    if (!mensaje) return res.status(404).json({ message: 'Mensaje no encontrado' });

    if (mensaje.usuarioId.toString() !== usuarioId) {
      return res.status(403).json({ message: 'No tienes permisos para actualizar este mensaje' });
    }

    const foro = await Foro.findById(mensaje.foroId);
    if (!foro) return res.status(404).json({ message: 'Foro no encontrado' });
    if (!foro.estaAbierto()) {
      return res.status(403).json({ message: 'No se puede editar en un foro cerrado' });
    }

    mensaje.contenido = contenido.trim();
    await mensaje.save();
    await mensaje.populate('usuarioId', 'nombre apellido fotoPerfilUrl rol');

    res.status(200).json({ message: 'Mensaje actualizado exitosamente', mensaje });
  } catch (error) {
    console.error('Error al actualizar mensaje:', error);
    res.status(500).json({ message: 'Error al actualizar el mensaje' });
  }
};