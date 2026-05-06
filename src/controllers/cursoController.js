// controllers/cursoController.js
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import csv from 'csv-parser';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { subirImagenCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';

// ─── HELPER DOCENTE ──────────────────────────────────────────────────────────

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

// ─── FUNCIÓN AUXILIAR: Procesar CSV ─────────────────────────────────────────

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

    console.log(' Procesando CSV para curso:', curso.nombre);

    const stream = Readable.from(file.buffer.toString());
    const usuarios = [];

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          headers: ['nombre', 'apellido', 'telefono', 'cedula'],
          skipEmptyLines: true
        }))
        .on('data', (data) => {
          if (data.nombre === 'nombre' && data.apellido === 'apellido') return;
          if (data.nombre && data.apellido && data.cedula && data.telefono) {
            usuarios.push({
              nombre: data.nombre.trim(),
              apellido: data.apellido.trim(),
              telefono: normalizarTelefono(data.telefono) || data.telefono?.trim() || '',
              cedula: data.cedula.trim(),
              contraseña: data.cedula.trim()
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

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
            estado: 'activo'
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
    console.log(`\nCSV procesado completamente`);

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

// ─── CREAR CURSO ─────────────────────────────────────────────────────────────

export const createCurso = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { nombre, descripcion, docenteId, fotoPortadaUrl } = req.body;

    const docente = await User.findById(docenteId);
    if (!docente || docente.rol !== 'docente') {
      return res.status(400).json({
        message: "El docenteId debe corresponder a un usuario con rol docente"
      });
    }

    let urlFoto = fotoPortadaUrl || null;
    let publicIdFoto = null;

    if (req.files?.fotoPortada?.[0]) {
      const resultadoCloudinary = await subirImagenCloudinary(
        req.files.fotoPortada[0].buffer,
        req.files.fotoPortada[0].mimetype,
        'fotos_cursos_portada'
      );
      urlFoto = resultadoCloudinary.url;
      publicIdFoto = resultadoCloudinary.publicId;
    } else if (req.file && req.file.fieldname === 'fotoPortada') {
      const resultadoCloudinary = await subirImagenCloudinary(
        req.file.buffer,
        req.file.mimetype,
        'fotos_cursos_portada'
      );
      urlFoto = resultadoCloudinary.url;
      publicIdFoto = resultadoCloudinary.publicId;
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

// ─── LISTAR CURSOS ───────────────────────────────────────────────────────────

export const getCursos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const { estado, docenteId } = req.query;

    const filtro = {};
    filtro.estado = estado || { $in: ['activo', 'archivado'] };
    if (docenteId) filtro.docenteId = docenteId;

    const cursos = await Curso.find(filtro)
      .populate('docenteId', 'nombre apellido correo telefono')
      .populate('participantes.usuarioId', 'nombre apellido correo rol')
      .skip(skip)
      .limit(limit)
      .sort({ fechaCreacion: -1 });

    const total = await Curso.countDocuments(filtro);

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

// ─── OBTENER CURSO POR ID ────────────────────────────────────────────────────

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

// ─── MIS CURSOS ──────────────────────────────────────────────────────────────

export const getMisCursos = async (req, res) => {
  try {
    const usuarioId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const cursos = await Curso.find({
      'participantes.usuarioId': usuarioId,
      estado: 'activo'
    })
      .populate('docenteId', 'nombre apellido correo')
      .populate('participantes.usuarioId', 'nombre apellido correo rol')
      .skip(skip)
      .limit(limit)
      .sort({ fechaCreacion: -1 });

    const total = await Curso.countDocuments({
      'participantes.usuarioId': usuarioId,
      estado: 'activo'
    });

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

// ─── ACTUALIZAR CURSO ────────────────────────────────────────────────────────

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
    const updateData = { ...req.body };

    delete updateData.participantes;
    delete updateData.fechaCreacion;
    delete updateData.fotoPortadaPublicId;

    if (req.file) {
      const cursoAntiguo = await Curso.findById(id);
      if (cursoAntiguo?.fotoPortadaPublicId) {
        await eliminarArchivoCloudinary(cursoAntiguo.fotoPortadaPublicId, 'image');
      }
      const resultadoCloudinary = await subirImagenCloudinary(
        req.file.buffer,
        req.file.mimetype,
        'fotos_cursos_portada'
      );
      updateData.fotoPortadaUrl = resultadoCloudinary.url;
      updateData.fotoPortadaPublicId = resultadoCloudinary.publicId;
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

// ─── ARCHIVAR CURSO ──────────────────────────────────────────────────────────

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

// ─── AGREGAR PARTICIPANTE ────────────────────────────────────────────────────

export const agregarParticipante = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, cedula, contraseña, telefono } = req.body;
    const usuarioLogueado = req.user;

    console.log(`\nAgregando participante individual al curso ${id}`);

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
        telefono: telefono?.trim() || '',
        correo: correoTemporal,
        contraseña: contraseña?.trim() || cedula.trim(),
        rol: 'padre',
        estado: 'activo'
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

// ─── REMOVER PARTICIPANTE ────────────────────────────────────────────────────

export const removerParticipante = async (req, res) => {
  try {
    const { id, usuarioId } = req.params;

    const curso = await Curso.findById(id)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

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

// ─── CARGA MASIVA CSV ────────────────────────────────────────────────────────

export const registrarUsuariosMasivo = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioLogueado = req.user;

    if (!req.file) {
      return res.status(400).json({ message: "No se ha subido ningún archivo CSV" });
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

// ─── OBTENER PARTICIPANTES ───────────────────────────────────────────────────

export const getParticipantesCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const { etiqueta, search, page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de curso no válido" });
    }

    const curso = await Curso.findById(id)
      .populate('docenteId', 'nombre apellido correo')
      .populate({
        path: 'participantes.usuarioId',
        select: 'nombre apellido correo telefono rol estado fotoPerfilUrl'
      });

    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

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