import Foro from '../models/Foro.js';
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import MensajeForo from '../models/MensajeForo.js'; 
import mongoose from 'mongoose';  

// VALIDACIÓN DE ARCHIVOS
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

// Función auxiliar para validar y procesar archivos
const procesarArchivosAdjuntos = async (files) => {
  const archivos = [];
  const errores = [];

  if (!files || files.length === 0) {
    return { archivos, errores };
  }

  console.log(`📎 Procesando ${files.length} archivos adjuntos`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      // Validar tipo de archivo
      const tipo = TIPOS_ARCHIVO_PERMITIDOS[file.mimetype];
      if (!tipo) {
        errores.push({
          archivo: file.originalname,
          error: `Tipo de archivo no permitido: ${file.mimetype}`
        });
        console.warn(` Archivo rechazado: ${file.originalname} (${file.mimetype})`);
        continue;
      }

      // Validar tamaño
      const tamanoMax = TAMANO_MAX_ARCHIVO[tipo];
      if (file.size > tamanoMax) {
        errores.push({
          archivo: file.originalname,
          error: `Archivo demasiado grande. Máximo: ${tamanoMax / (1024 * 1024)} MB`
        });
        console.warn(` Archivo muy grande: ${file.originalname} (${file.size} bytes)`);
        continue;
      }

      console.log(` Validación OK: ${file.originalname} (${tipo})`);

      // Subir a Cloudinary
      const resultado = await subirArchivoCloudinary(
        file.buffer,
        file.mimetype,
        'foros', // Carpeta en Cloudinary
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
        error: error.message || 'Error al subir el archivo'
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

    // Verificar que el curso existe
    const curso = await Curso.findById(cursoId);
    if (!curso) {
      return res.status(404).json({ message: 'Curso no encontrado' });
    }

    // Verificar que el usuario es docente del curso o administrador
    const user = await User.findById(docenteId);
    if (user.rol !== 'administrador' && curso.docenteId.toString() !== docenteId) {
      return res.status(403).json({ 
        message: 'No tienes permisos para crear foros en este curso' 
      });
    }

    // PROCESAR ARCHIVOS ADJUNTOS CON VALIDACIÓN MEJORADA
    const { archivos, errores } = await procesarArchivosAdjuntos(req.files);

    // Crear el foro
    const nuevoForo = new Foro({
      titulo,
      descripcion,
      docenteId,
      cursoId,
      archivos,
      publico: publico || false
    });

    await nuevoForo.save();

    // Poblar información del docente y curso
    await nuevoForo.populate([
      { path: 'docenteId', select: 'nombre apellido fotoPerfilUrl rol' },
      { path: 'cursoId', select: 'nombre' }
    ]);

    console.log(` Foro creado: ${nuevoForo._id}`);

    // Respuesta con información de archivos procesados
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

    // Verificar que el curso existe
    const curso = await Curso.findById(cursoId);
    if (!curso) {
      return res.status(404).json({ message: 'Curso no encontrado' });
    }

    // Verificar que el usuario tiene acceso al curso
    const user = await User.findById(usuarioId);
    const esDocenteDelCurso = curso.docenteId.toString() === usuarioId;
    const esParticipante = curso.esParticipante(usuarioId);
    const esAdministrador = user.rol === 'administrador';

    if (!esDocenteDelCurso && !esParticipante && !esAdministrador) {
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
    res.status(500).json({ message: 'Error al obtener los foros', error: error.message });
  }
};

// Obtener un foro por ID
export const obtenerForoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.userId;

    const foro = await Foro.findById(id)
      .populate('docenteId', 'nombre apellido fotoPerfilUrl rol')
      .populate('cursoId', 'nombre')
      .populate('totalMensajes');

    if (!foro) {
      return res.status(404).json({ message: 'Foro no encontrado' });
    }

    // Verificar acceso
    const tieneAcceso = await foro.tieneAcceso(usuarioId);
    const user = await User.findById(usuarioId);
    
    if (!tieneAcceso && user.rol !== 'administrador') {
      return res.status(403).json({ message: 'No tienes acceso a este foro' });
    }

    res.status(200).json({ foro });

  } catch (error) {
    console.error('Error al obtener foro:', error);
    res.status(500).json({ message: 'Error al obtener el foro', error: error.message });
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
    const user = await User.findById(usuarioId);
    const esCreador = foro.docenteId.toString() === usuarioId;
    const esAdministrador = user.rol === 'administrador';

    if (!esCreador && !esAdministrador) {
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
    res.status(500).json({ message: 'Error al actualizar el foro', error: error.message });
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
    const user = await User.findById(usuarioId);
    const esCreador = foro.docenteId.toString() === usuarioId;
    const esAdministrador = user.rol === 'administrador';

    if (!esCreador && !esAdministrador) {
      return res.status(403).json({ message: 'No tienes permisos para eliminar este foro' });
    }

    // ✅ Eliminar archivos de Cloudinary del foro
    if (foro.archivos && foro.archivos.length > 0) {
      console.log(`🗑️ Eliminando ${foro.archivos.length} archivos del foro`);
      for (const archivo of foro.archivos) {
        const resourceType = archivo.tipo === 'video' ? 'video' : 
                           archivo.tipo === 'pdf' ? 'raw' : 'image';
        await eliminarArchivoCloudinary(archivo.publicId, resourceType);
      }
    }

    // ✅ Obtener y eliminar archivos de todos los mensajes asociados
    const mensajes = await mongoose.model('MensajeForo').find({ foroId: id });
    for (const mensaje of mensajes) {
      if (mensaje.archivos && mensaje.archivos.length > 0) {
        for (const archivo of mensaje.archivos) {
          const resourceType = archivo.tipo === 'video' ? 'video' : 
                             archivo.tipo === 'pdf' ? 'raw' : 'image';
          await eliminarArchivoCloudinary(archivo.publicId, resourceType);
        }
      }
    }

    // Eliminar mensajes asociados
    await mongoose.model('MensajeForo').deleteMany({ foroId: id });

    await Foro.findByIdAndDelete(id);

    console.log(`✅ Foro eliminado: ${id}`);

    res.status(200).json({ message: 'Foro eliminado exitosamente' });

  } catch (error) {
    console.error('Error al eliminar foro:', error);
    res.status(500).json({ message: 'Error al eliminar el foro', error: error.message });
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
    const user = await User.findById(usuarioId);
    const esCreador = foro.docenteId.toString() === usuarioId;
    const esAdministrador = user.rol === 'administrador';

    if (!esCreador && !esAdministrador) {
      return res.status(403).json({ message: 'No tienes permisos para cambiar el estado' });
    }

    foro.estado = estado;
    await foro.save();

    console.log(`✅ Foro ${estado}: ${foro._id}`);

    res.status(200).json({
      message: `Foro ${estado === 'cerrado' ? 'cerrado' : 'abierto'} exitosamente`,
      foro
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({ message: 'Error al cambiar el estado', error: error.message });
  }
};