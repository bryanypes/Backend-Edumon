import MensajeForo from '../models/MensajeForo.js';
import Foro from '../models/Foro.js';
import User from '../models/User.js';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';

//  VALIDACIÓN DE ARCHIVOS 
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
  imagen: 5 * 1024 * 1024,    // 5 MB
  video: 50 * 1024 * 1024,    // 50 MB
  pdf: 10 * 1024 * 1024       // 10 MB
};

const procesarArchivosAdjuntos = async (files, carpeta = 'mensajes-foro') => {
  const archivos = [];
  const errores = [];

  if (!files || files.length === 0) {
    return { archivos, errores };
  }

  console.log(` Procesando ${files.length} archivos adjuntos`);

  for (const file of files) {
    try {
      const tipo = TIPOS_ARCHIVO_PERMITIDOS[file.mimetype];
      if (!tipo) {
        errores.push({
          archivo: file.originalname,
          error: `Tipo no permitido: ${file.mimetype}`
        });
        continue;
      }

      const tamanoMax = TAMANO_MAX_ARCHIVO[tipo];
      if (file.size > tamanoMax) {
        errores.push({
          archivo: file.originalname,
          error: `Tamaño máximo: ${tamanoMax / (1024 * 1024)} MB`
        });
        continue;
      }

      const resultado = await subirArchivoCloudinary(
        file.buffer,
        file.mimetype,
        carpeta,
        file.originalname
      );

      archivos.push({
        url: resultado.url,
        publicId: resultado.publicId,
        tipo: tipo,
        nombre: file.originalname,
        tamano: file.size
      });

      console.log(` Archivo subido: ${file.originalname}`);

    } catch (error) {
      console.error(` Error procesando ${file.originalname}:`, error);
      errores.push({
        archivo: file.originalname,
        error: error.message
      });
    }
  }

  return { archivos, errores };
};

// Crear mensaje en foro
export const crearMensaje = async (req, res) => {
  try {
    const { foroId, contenido, respuestaA } = req.body;
    const usuarioId = req.user.userId;

    // Validación básica
    if (!foroId || !contenido || contenido.trim().length === 0) {
      return res.status(400).json({ 
        message: 'El contenido del mensaje es requerido' 
      });
    }

    // Verificar que el foro existe y está abierto
    const foro = await Foro.findById(foroId);
    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    if (!foro.estaAbierto()) {
      return res.status(403).json({ message: 'El foro está cerrado' });
    }

    // Verificar que el usuario tiene acceso al foro
    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    const user = await User.findById(usuarioId);
    
    if (!tieneAcceso && user.rol !== 'administrador') {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    // Si es una respuesta, verificar restricciones
    if (respuestaA) {
      const mensajeOriginal = await MensajeForo.findById(respuestaA);
      if (!mensajeOriginal) {
        return res.status(404).json({ message: 'Mensaje original no encontrado' });
      }

      // Solo se puede responder a mensajes principales
      if (mensajeOriginal.respuestaA) {
        return res.status(400).json({ 
          message: 'Solo puedes responder directamente al foro' 
        });
      }

      // Los padres solo pueden responder a docentes
      if (user.rol === 'padre') {
        const usuarioOriginal = await User.findById(mensajeOriginal.usuarioId);
        if (usuarioOriginal.rol !== 'docente' && usuarioOriginal.rol !== 'administrador') {
          return res.status(403).json({ 
            message: 'Los padres solo pueden responder a mensajes de docentes' 
          });
        }
      }
    }

    // PROCESAR ARCHIVOS ADJUNTOS CON VALIDACIÓN
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

    console.log(` Mensaje creado: ${nuevoMensaje._id}`);

    // Respuesta con información de archivos
    const respuesta = {
      message: 'Mensaje creado exitosamente',
      mensaje: nuevoMensaje
    };

    if (errores.length > 0) {
      respuesta.advertencias = {
        message: `${errores.length} archivo(s) no pudieron ser procesados`,
        detalles: errores
      };
    }

    if (archivos.length > 0) {
      respuesta.archivosSubidos = archivos.length;
    }

    res.status(201).json(respuesta);

  } catch (error) {
    console.error(' Error al crear mensaje:', error);
    res.status(500).json({ 
      message: 'Error al crear el mensaje', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obtener mensajes de un foro
export const obtenerMensajesPorForo = async (req, res) => {
  try {
    const { foroId } = req.params;
    const usuarioId = req.user.userId;

    // Verificar que el foro existe
    const foro = await Foro.findById(foroId);
    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    // Verificar acceso
    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    const user = await User.findById(usuarioId);
    
    if (!tieneAcceso && user.rol !== 'administrador') {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    // Obtener mensajes principales
    const mensajes = await MensajeForo.find({ 
      foroId, 
      respuestaA: null 
    })
      .populate('usuarioId', 'nombre apellido fotoPerfilUrl rol')
      .sort({ fechaCreacion: 1 });

    // Obtener respuestas para cada mensaje
    const mensajesConRespuestas = await Promise.all(
      mensajes.map(async (mensaje) => {
        const respuestas = await MensajeForo.find({ 
          foroId, 
          respuestaA: mensaje._id 
        })
          .populate('usuarioId', 'nombre apellido fotoPerfilUrl rol')
          .sort({ fechaCreacion: 1 });

        return {
          ...mensaje.toObject(),
          respuestas
        };
      })
    );

    res.status(200).json({ mensajes: mensajesConRespuestas });

  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({ message: 'Error al obtener los mensajes', error: error.message });
  }
};

// Dar/quitar like a un mensaje
export const toggleLikeMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    const mensaje = await MensajeForo.findById(id);
    if (!mensaje) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    // Verificar acceso al foro
    const foro = await Foro.findById(mensaje.foroId);
    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    const user = await User.findById(usuarioId);
    
    if (!tieneAcceso && user.rol !== 'administrador') {
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
    res.status(500).json({ message: 'Error al actualizar like', error: error.message });
  }
};

// Eliminar mensaje
export const eliminarMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    const mensaje = await MensajeForo.findById(id);
    if (!mensaje) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    // Verificar permisos
    const user = await User.findById(usuarioId);
    const esAutor = mensaje.usuarioId.toString() === usuarioId;
    const esAdministrador = user.rol === 'administrador';

    if (!esAutor && !esAdministrador) {
      return res.status(403).json({ 
        message: 'No tienes permisos para eliminar este mensaje' 
      });
    }

    //  Eliminar archivos del mensaje principal
    if (mensaje.archivos && mensaje.archivos.length > 0) {
      console.log(`🗑️ Eliminando ${mensaje.archivos.length} archivos del mensaje`);
      for (const archivo of mensaje.archivos) {
        const resourceType = archivo.tipo === 'video' ? 'video' : 
                           archivo.tipo === 'pdf' ? 'raw' : 'image';
        await eliminarArchivoCloudinary(archivo.publicId, resourceType);
      }
    }

    //  Obtener respuestas y eliminar sus archivos también
    const respuestas = await MensajeForo.find({ respuestaA: id });
    for (const respuesta of respuestas) {
      if (respuesta.archivos && respuesta.archivos.length > 0) {
        for (const archivo of respuesta.archivos) {
          const resourceType = archivo.tipo === 'video' ? 'video' : 
                             archivo.tipo === 'pdf' ? 'raw' : 'image';
          await eliminarArchivoCloudinary(archivo.publicId, resourceType);
        }
      }
    }

    // Eliminar respuestas asociadas
    await MensajeForo.deleteMany({ respuestaA: id });

    await MensajeForo.findByIdAndDelete(id);

    console.log(` Mensaje eliminado: ${id}`);

    res.status(200).json({ message: 'Mensaje eliminado exitosamente' });

  } catch (error) {
    console.error('Error al eliminar mensaje:', error);
    res.status(500).json({ message: 'Error al eliminar el mensaje', error: error.message });
  }
};

// Actualizar mensaje
export const actualizarMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const { contenido } = req.body;
    const usuarioId = req.user.userId;

    if (!contenido || contenido.trim().length === 0) {
      return res.status(400).json({ 
        message: 'El contenido no puede estar vacío' 
      });
    }

    const mensaje = await MensajeForo.findById(id);
    if (!mensaje) {
      return res.status(404).json({ message: 'Mensaje no encontrado' });
    }

    // Solo el autor puede actualizar
    if (mensaje.usuarioId.toString() !== usuarioId) {
      return res.status(403).json({ 
        message: 'No tienes permisos para actualizar este mensaje' 
      });
    }

    // Verificar que el foro sigue abierto
    const foro = await Foro.findById(mensaje.foroId);
    if (!foro.estaAbierto()) {
      return res.status(403).json({ 
        message: 'No se puede editar en un foro cerrado' 
      });
    }

    mensaje.contenido = contenido.trim();
    await mensaje.save();
    await mensaje.populate('usuarioId', 'nombre apellido fotoPerfilUrl rol');

    console.log(` Mensaje actualizado: ${id}`);

    res.status(200).json({
      message: 'Mensaje actualizado exitosamente',
      mensaje
    });

  } catch (error) {
    console.error('Error al actualizar mensaje:', error);
    res.status(500).json({ 
      message: 'Error al actualizar el mensaje', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};