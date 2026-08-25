// controllers/cursoController.js
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { parseFilasUsuarios } from '../utils/parseExcelUsuarios.js';
import mongoose from 'mongoose';
import { subirImagenCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';
import { AVATAR_PREDETERMINADO } from '../utils/avatarPredeterminado.js';
import { getFileBuffer } from '../utils/fileUploadHelper.js';

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

// Procesa un Excel (.xlsx/.xlsm) de usuarios y los agrega al curso (usado en creación y en carga masiva)
async function procesarUsuariosCSV(file, cursoId) {
  const resultados = {
    exitosos: [],
    errores: [],
    duplicados: []
  };

  try {
    const curso = await Curso.findById(cursoId)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) {
      throw new Error("Curso no encontrado");
    }

    console.log(' Procesando Excel para curso:', curso.nombre);

    const fileBuffer = await getFileBuffer(file);
    if (!fileBuffer) {
      throw new Error('No se pudo leer el archivo Excel');
    }

    // A diferencia de preregistrarDocentesCSV, aquí el teléfono es obligatorio
    // (se usa para contactar al padre) — mismo requisito que tenía el CSV.
    const usuarios = (await parseFilasUsuarios(fileBuffer))
      .filter((fila) => fila.telefono)
      .map((fila) => ({
        nombre: fila.nombre,
        apellido: fila.apellido,
        telefono: normalizarTelefono(fila.telefono) || fila.telefono,
        cedula: fila.cedula,
        contraseña: fila.cedula
      }));

    console.log(` Total usuarios a procesar: ${usuarios.length}`);

    for (const userData of usuarios) {
      try {
        const { nombre, apellido, telefono, cedula, contraseña } = userData;
        const correoTemporal = `${cedula}@temp.com`;
        const telefonoNormalizado = normalizarTelefono(telefono) || telefono;

        let usuario = await User.findOne({
          $or: [{ cedula }, { correo: correoTemporal }]
        });

        let esNuevoUsuario = false;

        if (usuario) {
          if (curso.esParticipante(usuario._id)) {
            resultados.duplicados.push({
              nombre: `${usuario.nombre} ${usuario.apellido}`,
              cedula,
              motivo: 'Ya está inscrito en este curso'
            });
            continue;
          }

          curso.agregarParticipante(usuario._id, 'padre');
          resultados.exitosos.push({
            nombre: `${usuario.nombre} ${usuario.apellido}`,
            cedula,
            accion: 'Usuario existente agregado al curso'
          });

        } else {
          const nuevoUsuario = new User({
            nombre,
            apellido,
            telefono: telefonoNormalizado,
            cedula,
            correo: correoTemporal,
            contraseña,
            rol: 'padre',
            estado: 'activo',
            fotoPerfilUrl: AVATAR_PREDETERMINADO
          });

          usuario = await nuevoUsuario.save();
          esNuevoUsuario = true;
          curso.agregarParticipante(usuario._id, 'padre');

          resultados.exitosos.push({
            nombre: `${usuario.nombre} ${usuario.apellido}`,
            cedula,
            accion: 'Usuario creado y agregado al curso'
          });
        }

        try {
          if (esNuevoUsuario) {
            eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, usuario);
          }
          eventBus.publicar(EVENTOS.USUARIO_AGREGADO_CURSO, { usuarioId: usuario._id, curso });
        } catch (notifError) {
          console.error('Error notificaciones:', notifError.message);
        }

      } catch (error) {
        if (error.code === 11000) {
          resultados.duplicados.push({
            datos: userData,
            motivo: 'Cédula o correo ya registrado en el sistema'
          });
        } else {
          resultados.errores.push({
            datos: userData,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
        }
      }
    }

    await curso.save();
    console.log(`\nExcel procesado completamente`);

    return {
      resumen: {
        total: usuarios.length,
        exitosos: resultados.exitosos.length,
        errores: resultados.errores.length,
        duplicados: resultados.duplicados.length
      },
      detalles: resultados
    };

  } catch (error) {
    console.error('Error en procesarUsuariosCSV:', error);
    throw error;
  }
}

// Crear curso
export const createCurso = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { nombre, descripcion, docenteId, fotoPortadaUrl, color } = req.body;

    const docente = await User.findById(docenteId);
    if (!docente || docente.rol !== 'docente') {
      return res.status(400).json({
        message: "El docenteId debe corresponder a un usuario con rol docente"
      });
    }

    let urlFoto = fotoPortadaUrl || null;
    let publicIdFoto = null;

    if (req.files?.fotoPortada?.[0]) {
      const file = req.files.fotoPortada[0];
      const fileBuffer = await getFileBuffer(file);
      if (fileBuffer) {
        const resultadoCloudinary = await subirImagenCloudinary(
          fileBuffer,
          file.mimetype,
          'fotos_cursos_portada'
        );
        urlFoto = resultadoCloudinary.url;
        publicIdFoto = resultadoCloudinary.publicId;
      }
    } else if (req.file && req.file.fieldname === 'fotoPortada') {
      const fileBuffer = await getFileBuffer(req.file);
      if (fileBuffer) {
        const resultadoCloudinary = await subirImagenCloudinary(
          fileBuffer,
          req.file.mimetype,
          'fotos_cursos_portada'
        );
        urlFoto = resultadoCloudinary.url;
        publicIdFoto = resultadoCloudinary.publicId;
      }
    }

    const institucionId = req.user.institucionId;
    if (!institucionId) {
      return res.status(400).json({
        message: "No tienes institución asignada. Contacta al administrador."
      });
    }

    const nuevoCurso = new Curso({
      nombre,
      descripcion,
      fotoPortadaUrl: urlFoto,
      fotoPortadaPublicId: publicIdFoto,
      color: color || null,
      docenteId,
      institucionId,
      participantes: [{ usuarioId: docenteId, etiqueta: 'docente' }]
    });

    const cursoGuardado = await nuevoCurso.save();

    let resultadosCarga = null;
    if (req.files?.archivoCSV?.[0]) {
      resultadosCarga = await procesarUsuariosCSV(req.files.archivoCSV[0], cursoGuardado._id);
      await cursoGuardado.populate('participantes.usuarioId', 'nombre apellido correo rol');
    } else if (req.file && req.file.fieldname === 'archivoCSV') {
      resultadosCarga = await procesarUsuariosCSV(req.file, cursoGuardado._id);
      await cursoGuardado.populate('participantes.usuarioId', 'nombre apellido correo rol');
    }

    await cursoGuardado.populate('docenteId', 'nombre apellido correo');

    const respuesta = {
      message: "Curso creado exitosamente",
      curso: {
        ...cursoGuardado.toObject(),
        docente: formatearDocente(cursoGuardado.docenteId)
      }
    };

    if (resultadosCarga) {
      respuesta.cargaMasiva = resultadosCarga;
    }

    res.status(201).json(respuesta);

  } catch (error) {
    console.error('Error al crear curso:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Listar cursos
export const getCursos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const { estado, docenteId } = req.query;

    // Aislamiento por institución: sin este filtro, cualquier admin/docente/padre
    // autenticado (el rol lo permite la ruta) podía listar los cursos de TODAS
    // las instituciones de la plataforma, incluyendo datos de contacto de
    // docentes y participantes de colegios ajenos.
    const filtro = { institucionId: req.user.institucionId };
    filtro.estado = estado || { $in: ['activo', 'archivado'] };
    if (docenteId) filtro.docenteId = docenteId;

    const [cursos, total] = await Promise.all([
      Curso.find(filtro)
        .populate('docenteId', 'nombre apellido correo telefono')
        .populate('participantes.usuarioId', 'nombre apellido correo rol')
        .skip(skip)
        .limit(limit)
        .sort({ fechaCreacion: -1 }),
      Curso.countDocuments(filtro)
    ]);

    const cursosConDocente = cursos.map(c => ({
      ...c.toObject(),
      docente: formatearDocente(c.docenteId)
    }));

    res.json({
      cursos: cursosConDocente,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCursos: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });

  } catch (error) {
    console.error('Error al obtener cursos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Obtener curso por ID
export const getCursoById = async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id)
      .populate('docenteId', 'nombre apellido correo telefono')
      .populate('participantes.usuarioId', 'nombre apellido correo rol telefono');

    if (!curso) {
      return res.status(404).json({ message: "Curso no encontrado" });
    }

    res.json({
      curso: {
        ...curso.toObject(),
        docente: formatearDocente(curso.docenteId)
      }
    });

  } catch (error) {
    console.error('Error al obtener curso:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Obtener cursos donde el usuario logueado participa
export const getMisCursos = async (req, res) => {
  try {
    const usuarioId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const filtro = {
      'participantes.usuarioId': usuarioId,
      estado: 'activo'
    };

    const [cursos, total] = await Promise.all([
      Curso.find(filtro)
        .populate('docenteId', 'nombre apellido correo')
        .populate('participantes.usuarioId', 'nombre apellido correo rol')
        .skip(skip)
        .limit(limit)
        .sort({ fechaCreacion: -1 }),
      Curso.countDocuments(filtro)
    ]);

    const cursosConDocente = cursos.map(c => ({
      ...c.toObject(),
      docente: formatearDocente(c.docenteId)
    }));

    res.json({
      cursos: cursosConDocente,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCursos: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error al obtener mis cursos:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Actualizar curso
export const updateCurso = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const usuarioLogueado = req.user;

    const curso = await Curso.findById(id);
    if (!curso) {
      return res.status(404).json({ message: "Curso no encontrado" });
    }

    if (usuarioLogueado.rol === 'docente' &&
      curso.docenteId.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({ message: "No tienes permisos para actualizar este curso" });
    }

    const updateData = { ...req.body };

    // No permitir reasignar dueño/institución del curso desde este endpoint
    delete updateData.participantes;
    delete updateData.fechaCreacion;
    delete updateData.fotoPortadaPublicId;
    delete updateData.docenteId;
    delete updateData.institucionId;

    if (req.file) {
      if (curso.fotoPortadaPublicId) {
        await eliminarArchivoCloudinary(curso.fotoPortadaPublicId, 'image').catch(() => {});
      }
      const fileBuffer = await getFileBuffer(req.file);
      if (fileBuffer) {
        const resultadoCloudinary = await subirImagenCloudinary(
          fileBuffer,
          req.file.mimetype,
          'fotos_cursos_portada'
        );
        updateData.fotoPortadaUrl = resultadoCloudinary.url;
        updateData.fotoPortadaPublicId = resultadoCloudinary.publicId;
      }
    }

    const cursoActualizado = await Curso.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('docenteId', 'nombre apellido correo')
      .populate('participantes.usuarioId', 'nombre apellido correo rol');

    if (!cursoActualizado) {
      return res.status(404).json({ message: "Curso no encontrado" });
    }

    res.json({
      message: "Curso actualizado exitosamente",
      curso: {
        ...cursoActualizado.toObject(),
        docente: formatearDocente(cursoActualizado.docenteId)
      }
    });

  } catch (error) {
    console.error('Error al actualizar curso:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Archivar curso (soft delete)
export const archivarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioLogueado = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de curso no válido" });
    }

    const curso = await Curso.findById(id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    if (curso.estado === 'archivado') {
      return res.status(400).json({ message: "El curso ya está archivado" });
    }

    if (usuarioLogueado.rol === 'docente' &&
      curso.docenteId.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({ message: "No tienes permisos para archivar este curso" });
    }

    curso.estado = 'archivado';
    await curso.save();

    await curso.populate('docenteId', 'nombre apellido correo');
    await curso.populate('participantes.usuarioId', 'nombre apellido correo rol');

    res.json({
      message: "Curso archivado exitosamente",
      curso: {
        ...curso.toObject(),
        docente: formatearDocente(curso.docenteId)
      }
    });

  } catch (error) {
    console.error('Error al archivar curso:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Restaurar curso archivado (revierte el soft delete)
export const restaurarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioLogueado = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de curso no válido" });
    }

    const curso = await Curso.findById(id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    if (curso.estado === 'activo') {
      return res.status(400).json({ message: "El curso ya está activo" });
    }

    const esDocenteDueño = usuarioLogueado.rol === 'docente' &&
      curso.docenteId.toString() === usuarioLogueado.userId;
    const esAdminDeLaInstitucion = usuarioLogueado.rol === 'administrador' &&
      curso.institucionId.toString() === usuarioLogueado.institucionId;
    const esSuperadmin = usuarioLogueado.rol === 'superadmin';

    if (!esDocenteDueño && !esAdminDeLaInstitucion && !esSuperadmin) {
      return res.status(403).json({ message: "No tienes permisos para restaurar este curso" });
    }

    curso.estado = 'activo';
    await curso.save();

    await curso.populate('docenteId', 'nombre apellido correo');
    await curso.populate('participantes.usuarioId', 'nombre apellido correo rol');

    res.json({
      message: "Curso restaurado exitosamente",
      curso: {
        ...curso.toObject(),
        docente: formatearDocente(curso.docenteId)
      }
    });

  } catch (error) {
    console.error('Error al restaurar curso:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Agregar un único participante a un curso (crea el usuario si no existe)
export const agregarParticipante = async (req, res) => {
  try {
    // participanteValidator ya saneó el teléfono a +57XXXXXXXXXX; aquí se
    // reportan sus errores para no crear participantes con datos fuera de norma
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { nombre, apellido, cedula, contraseña, telefono } = req.body;
    const usuarioLogueado = req.user;

    if (!nombre || !apellido || !cedula) {
      return res.status(400).json({
        message: "Los campos nombre, apellido y cedula son requeridos"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de curso no válido" });
    }

    const curso = await Curso.findById(id)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

    if (usuarioLogueado.rol === 'docente' &&
      curso.docenteId._id.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({
        message: "No tienes permisos para agregar participantes a este curso"
      });
    }

    const correoTemporal = `${cedula.trim()}@temp.com`;
    let detalles = {};
    let usuarioFinalId = null;
    let esNuevoUsuario = false;

    let usuario = await User.findOne({
      $or: [{ cedula: cedula.trim() }, { correo: correoTemporal }]
    });

    if (usuario) {
      if (curso.esParticipante(usuario._id)) {
        return res.status(400).json({
          message: "El usuario ya está inscrito en este curso",
          usuario: { nombre: `${usuario.nombre} ${usuario.apellido}`, cedula }
        });
      }

      curso.agregarParticipante(usuario._id, 'padre');
      usuarioFinalId = usuario._id;
      detalles = {
        nombre: `${usuario.nombre} ${usuario.apellido}`,
        cedula: cedula.trim(),
        accion: "Agregado al curso (usuario existente)"
      };

    } else {
      const nuevoUsuario = new User({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        cedula: cedula.trim(),
        // Mismo formato que en el resto del sistema: +57XXXXXXXXXX
        telefono: normalizarTelefono(telefono) || telefono?.trim() || '',
        correo: correoTemporal,
        // Regla única del sistema: contraseña inicial = cédula
        contraseña: contraseña?.trim() || cedula.trim(),
        rol: 'padre',
        estado: 'activo',
        fotoPerfilUrl: AVATAR_PREDETERMINADO
      });

      usuario = await nuevoUsuario.save();
      esNuevoUsuario = true;
      curso.agregarParticipante(usuario._id, 'padre');
      usuarioFinalId = usuario._id;
      detalles = {
        nombre: `${usuario.nombre} ${usuario.apellido}`,
        cedula: cedula.trim(),
        accion: "Usuario creado y agregado al curso"
      };
    }

    await curso.save();
    await curso.populate('participantes.usuarioId', 'nombre apellido correo rol cedula telefono');

    try {
      if (esNuevoUsuario) {
        eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, usuario);
      }
      eventBus.publicar(EVENTOS.USUARIO_AGREGADO_CURSO, { usuarioId: usuarioFinalId, curso });
    } catch (notifError) {
      console.error('Error al enviar notificaciones:', notifError);
    }

    res.json({
      message: "Participante agregado exitosamente",
      detalles,
      curso: {
        ...curso.toObject(),
        docente: formatearDocente(curso.docenteId)
      }
    });

  } catch (error) {
    console.error('Error al agregar participante:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Ya existe un usuario con esta cédula o correo" });
    }
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Remover participante de un curso
export const removerParticipante = async (req, res) => {
  try {
    const { id, usuarioId } = req.params;
    const usuarioLogueado = req.user;

    const curso = await Curso.findById(id)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

    if (usuarioLogueado.rol === 'docente' &&
      curso.docenteId._id.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({ message: "No tienes permisos para remover participantes de este curso" });
    }

    if (curso.docenteId._id.toString() === usuarioId) {
      return res.status(400).json({ message: "No se puede remover al docente principal del curso" });
    }

    if (!curso.esParticipante(usuarioId)) {
      return res.status(400).json({ message: "El usuario no es participante de este curso" });
    }

    curso.removerParticipante(usuarioId);
    await curso.save();
    await curso.populate('participantes.usuarioId', 'nombre apellido correo rol');

    res.json({
      message: "Participante removido exitosamente",
      curso: {
        ...curso.toObject(),
        docente: formatearDocente(curso.docenteId)
      }
    });

  } catch (error) {
    console.error('Error al remover participante:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Carga masiva de usuarios vía Excel (.xlsx/.xlsm)
export const registrarUsuariosMasivo = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioLogueado = req.user;

    if (!req.file) {
      return res.status(400).json({ message: "No se ha subido ningún archivo Excel" });
    }

    const curso = await Curso.findById(id)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

    if (usuarioLogueado.rol === 'docente' &&
      curso.docenteId._id.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({ message: "No tienes permisos para agregar usuarios a este curso" });
    }

    const resultadosCarga = await procesarUsuariosCSV(req.file, id);

    res.status(200).json({
      message: "Proceso de registro masivo completado",
      docente: formatearDocente(curso.docenteId),
      ...resultadosCarga
    });

  } catch (error) {
    console.error('Error en registro masivo:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obtener participantes de un curso (con filtros y paginación)
export const getParticipantesCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const { etiqueta, search, page = 1, limit = 50 } = req.query;
    const usuarioLogueado = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de curso no válido" });
    }

    const curso = await Curso.findById(id)
      .populate('docenteId', 'nombre apellido correo')
      .populate({
        path: 'participantes.usuarioId',
        select: 'nombre apellido correo telefono rol estado fotoPerfilUrl'
      })
      .lean();

    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

    if (usuarioLogueado.rol === 'docente' &&
      curso.docenteId._id.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({ message: "No tienes permisos para ver los participantes de este curso" });
    }

    let participantes = curso.participantes.filter(p => p.usuarioId !== null);

    if (etiqueta) {
      participantes = participantes.filter(p => p.etiqueta === etiqueta);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      participantes = participantes.filter(p => {
        const u = p.usuarioId;
        return (
          u.nombre.toLowerCase().includes(searchLower) ||
          u.apellido.toLowerCase().includes(searchLower) ||
          u.correo.toLowerCase().includes(searchLower)
        );
      });
    }

    const skip = (page - 1) * limit;
    const total = participantes.length;
    const paginados = participantes.slice(skip, skip + parseInt(limit));

    const participantesFormateados = paginados.map(p => ({
      _id: p.usuarioId._id,
      nombre: p.usuarioId.nombre,
      apellido: p.usuarioId.apellido,
      correo: p.usuarioId.correo,
      telefono: p.usuarioId.telefono,
      rol: p.usuarioId.rol,
      estado: p.usuarioId.estado,
      etiqueta: p.etiqueta,
      fotoPerfilUrl: p.usuarioId.fotoPerfilUrl,
      nombreCompleto: `${p.usuarioId.nombre} ${p.usuarioId.apellido}`
    }));

    res.json({
      cursoId: curso._id,
      cursoNombre: curso.nombre,
      docente: formatearDocente(curso.docenteId),
      participantes: participantesFormateados,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalParticipantes: total,
        hasNextPage: parseInt(page) < Math.ceil(total / limit),
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error al obtener participantes del curso:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};