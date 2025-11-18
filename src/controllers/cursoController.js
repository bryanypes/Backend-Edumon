// controllers/cursoController.js
import Curso from '../models/Curso.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import csv from 'csv-parser';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { subirImagenCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { notificarAgregarCurso } from '../services/notificacionService.js';

// FUNCIÓN AUXILIAR: Procesar CSV
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
          // Saltar headers
          if (data.nombre === 'nombre' && data.apellido === 'apellido') return;

          if (data.nombre && data.apellido && data.cedula && data.telefono) {
            usuarios.push({
              nombre: data.nombre.trim(),
              apellido: data.apellido.trim(),
              telefono: data.telefono.trim(),
              cedula: data.cedula.trim(),
              contraseña: data.cedula.trim()
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(` Total usuarios a procesar: ${usuarios.length}`);

    // Procesar cada usuario
    for (const userData of usuarios) {
      try {
        const { nombre, apellido, telefono, cedula, contraseña } = userData;
        const correoTemporal = `${cedula}@temp.com`;

        console.log(`\n Procesando: ${nombre} ${apellido} (${cedula})`);

        // Buscar usuario existente por cédula o correo temporal
        let usuario = await User.findOne({
          $or: [{ cedula }, { correo: correoTemporal }]
        });

        let esNuevoUsuario = false;

        if (usuario) {
          console.log(`Usuario existente encontrado: ${usuario._id}`);

          if (curso.esParticipante(usuario._id)) {
            console.log(`Usuario YA está en el curso`);
            resultados.duplicados.push({
              nombre: `${usuario.nombre} ${usuario.apellido}`,
              cedula,
              motivo: "Ya está inscrito en el curso"
            });
            continue; // Saltar al siguiente
          } else {
            console.log(`Agregando usuario existente al curso`);
            curso.agregarParticipante(usuario._id, 'padre');
            resultados.exitosos.push({
              nombre: `${usuario.nombre} ${usuario.apellido}`,
              cedula,
              accion: "Agregado al curso (usuario existente)"
            });
          }
        } else {
          console.log(`Creando nuevo usuario`);
          const nuevoUsuario = new User({
            nombre,
            apellido,
            telefono,
            cedula,
            correo: correoTemporal,
            contraseña,
            rol: 'padre',
            estado: 'activo'
          });

          usuario = await nuevoUsuario.save();
          console.log(`Usuario creado: ${usuario._id}`);

          esNuevoUsuario = true;
          curso.agregarParticipante(usuario._id, 'padre');

          resultados.exitosos.push({
            nombre: `${usuario.nombre} ${usuario.apellido}`,
            cedula,
            accion: "Usuario creado y agregado al curso"
          });
        }

        // ENVIAR NOTIFICACIONES
        try {
          // 1️⃣ Notificación de bienvenida (solo para nuevos usuarios)
          if (esNuevoUsuario) {
            console.log(` Enviando notificación de BIENVENIDA a ${usuario.nombre} ${usuario.apellido}`);
            await notificarBienvenida(usuario); // ✅ Pasa el objeto usuario, no el ID
            console.log(` Bienvenida enviada`);
          }

          // 2️⃣ Notificación de agregar al curso (para todos)
          console.log(` Enviando notificación de AGREGAR CURSO a ${usuario.nombre} ${usuario.apellido}`);
          await notificarAgregarCurso(usuario._id, curso);
          console.log(` Notificación de curso enviada`);

        } catch (notifError) {
          console.error(` ❌ Error al enviar notificaciones:`, notifError);
          console.error('Stack:', notifError.stack);
        }

      } catch (error) {
        console.error(`Error procesando usuario ${userData.cedula}:`, error);

        if (error.code === 11000) {
          // Duplicado - intentar recuperar y agregar al curso
          try {
            const { cedula } = userData;
            const correoTemporal = `${cedula}@temp.com`;

            let usuario = await User.findOne({
              $or: [{ cedula }, { correo: correoTemporal }]
            });

            if (usuario && curso.esParticipante(usuario._id)) {
              resultados.duplicados.push({
                nombre: `${usuario.nombre} ${usuario.apellido}`,
                cedula,
                motivo: "Ya está inscrito en el curso"
              });
            } else if (usuario) {
              curso.agregarParticipante(usuario._id, 'padre');
              resultados.exitosos.push({
                nombre: `${usuario.nombre} ${usuario.apellido}`,
                cedula,
                accion: "Agregado al curso (usuario existente)"
              });

              // Notificar
              try {
                await notificarAgregarCurso(usuario._id, curso);
              } catch (notifError) {
                console.error('Error al enviar notificación:', notifError);
              }
            }
          } catch (innerError) {
            resultados.errores.push({
              datos: userData,
              error: innerError.message
            });
          }
        } else {
          resultados.errores.push({
            datos: userData,
            error: error.message
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

// CREAR CURSO (con imagen en Cloudinary)
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

    // Verificar que el docente existe y tiene el rol correcto
    const docente = await User.findById(docenteId);
    if (!docente || docente.rol !== 'docente') {
      return res.status(400).json({
        message: "El docenteId debe corresponder a un usuario con rol docente"
      });
    }

    // Determinar la URL de la foto
    let urlFoto = fotoPortadaUrl || null;
    let publicIdFoto = null;

    // Si se subió un archivo de imagen, subirlo a Cloudinary
    if (req.files?.fotoPortada?.[0]) {
      const resultadoCloudinary = await subirImagenCloudinary(
        req.files.fotoPortada[0].buffer,
        req.files.fotoPortada[0].mimetype,
        'fotos_cursos_portada' // Carpeta específica
      );
      urlFoto = resultadoCloudinary.url;
      publicIdFoto = resultadoCloudinary.publicId;
    } else if (req.file && req.file.fieldname === 'fotoPortada') {
      const resultadoCloudinary = await subirImagenCloudinary(
        req.file.buffer,
        req.file.mimetype,
        'fotos_cursos_portada' // Carpeta específica
      );
      urlFoto = resultadoCloudinary.url;
      publicIdFoto = resultadoCloudinary.publicId;
    }

    // Crear el curso
    const nuevoCurso = new Curso({
      nombre,
      descripcion,
      fotoPortadaUrl: urlFoto,
      fotoPortadaPublicId: publicIdFoto,
      docenteId,
      participantes: [{ usuarioId: docenteId, etiqueta: 'docente' }]
    });

    const cursoGuardado = await nuevoCurso.save();

    // Si hay archivo CSV, procesar usuarios masivamente
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
      curso: cursoGuardado
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

// LISTAR CURSOS (con filtros y paginación)
export const getCursos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { estado, docenteId } = req.query;

    // Construir filtro flexible
    const filtro = {};

    // Si hay estado, filtra por ese valor. Si no, incluye activos y archivados
    filtro.estado = estado || { $in: ['activo', 'archivado'] };

    // Si se pasa un docenteId, agrégalo al filtro
    if (docenteId) {
      filtro.docenteId = docenteId;
    }

    // Buscar cursos con paginación y relaciones
    const cursos = await Curso.find(filtro)
      .populate('docenteId', 'nombre apellido correo telefono')
      .populate('participantes.usuarioId', 'nombre apellido correo rol')
      .skip(skip)
      .limit(limit)
      .sort({ fechaCreacion: -1 });

    // Contar total de documentos con el mismo filtro
    const total = await Curso.countDocuments(filtro);

    // Respuesta
    res.json({
      cursos,
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
    res.status(500).json({
      message: 'Error interno del servidor',
    });
  }
};

// OBTENER CURSO POR ID
export const getCursoById = async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id)
      .populate('docenteId', 'nombre apellido correo telefono')
      .populate('participantes.usuarioId', 'nombre apellido correo rol telefono');

    if (!curso) {
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    res.json({ curso });

  } catch (error) {
    console.error('Error al obtener curso:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// OBTENER MIS CURSOS
export const getMisCursos = async (req, res) => {
  try {
    const usuarioId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
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

    res.json({
      cursos,
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
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// ACTUALIZAR CURSO (con nueva imagen en Cloudinary)
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

    // No permitir actualizar estos campos manualmente
    delete updateData.participantes;
    delete updateData.fechaCreacion;
    delete updateData.fotoPortadaPublicId;

    // Si se subió una nueva foto
    if (req.file) {
      // Buscar el curso para obtener el public_id de la foto antigua
      const cursoAntiguo = await Curso.findById(id);

      // Eliminar foto antigua de Cloudinary si existe
      if (cursoAntiguo?.fotoPortadaPublicId) {
        await eliminarArchivoCloudinary(cursoAntiguo.fotoPortadaPublicId, 'image');
      }

      // Subir nueva foto a Cloudinary
      const resultadoCloudinary = await subirImagenCloudinary(
        req.file.buffer,
        req.file.mimetype,
        'fotos_cursos_portada' // Carpeta específica
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
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    res.json({
      message: "Curso actualizado exitosamente",
      curso: cursoActualizado
    });

  } catch (error) {
    console.error('Error al actualizar curso:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ARCHIVAR CURSO (soft delete)
export const archivarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioLogueado = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "ID de curso no válido"
      });
    }

    const curso = await Curso.findById(id);

    if (!curso) {
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    if (curso.estado === 'archivado') {
      return res.status(400).json({
        message: "El curso ya está archivado"
      });
    }

    // Validar permisos
    if (usuarioLogueado.rol === 'docente' &&
      curso.docenteId.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({
        message: "No tienes permisos para archivar este curso"
      });
    }

    curso.estado = 'archivado';
    await curso.save();

    await curso.populate('docenteId', 'nombre apellido correo');
    await curso.populate('participantes.usuarioId', 'nombre apellido correo rol');

    res.json({
      message: "Curso archivado exitosamente",
      curso
    });

  } catch (error) {
    console.error('Error al archivar curso:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// AGREGAR PARTICIPANTE AL CURSO (individual)
export const agregarParticipante = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, cedula, contraseña, telefono } = req.body;
    const usuarioLogueado = req.user;

    console.log(`\nAgregando participante individual al curso ${id}`);
    console.log(`Datos recibidos:`, { nombre, apellido, cedula, telefono });

    if (!nombre || !apellido || !cedula) {
      return res.status(400).json({
        message: "Los campos nombre, apellido y cedula son requeridos"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "ID de curso no válido"
      });
    }

    const curso = await Curso.findById(id)
      .populate('docenteId', 'nombre apellido correo');

    if (!curso) {
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    console.log(`Curso encontrado: ${curso.nombre}`);

    // Validar permisos
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

    // Buscar usuario por cédula o correo
    let usuario = await User.findOne({
      $or: [
        { cedula: cedula.trim() },
        { correo: correoTemporal }
      ]
    });

    if (usuario) {
      console.log(`Usuario existente encontrado: ${usuario._id}`);

      if (curso.esParticipante(usuario._id)) {
        console.log(`Usuario YA está inscrito en el curso`);
        return res.status(400).json({
          message: "El usuario ya está inscrito en este curso",
          usuario: {
            nombre: `${usuario.nombre} ${usuario.apellido}`,
            cedula: cedula
          }
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
      console.log(`Creando nuevo usuario`);

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
      console.log(`Usuario creado: ${usuario._id}`);

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
    console.log(`Curso guardado con nuevo participante`);

    // Popular el curso ANTES de enviar notificaciones
    await curso.populate('participantes.usuarioId', 'nombre apellido correo rol cedula telefono');

    // ENVIAR NOTIFICACIONES
    if (usuarioFinalId) {
      try {
        // Notificación de bienvenida (solo nuevos usuarios)
        if (esNuevoUsuario) {
          console.log(`Enviando notificación de BIENVENIDA a ${usuarioFinalId}`);
          const { notificarBienvenida } = await import('../services/notificacionService.js');
          await notificarBienvenida(usuarioFinalId);
          console.log(`Bienvenida enviada`);
        }

        // Notificación de agregar al curso (para todos)
        console.log(`Enviando notificación de AGREGAR CURSO a ${usuarioFinalId}`);
        await notificarAgregarCurso(usuarioFinalId, curso);
        console.log(`Notificación de curso enviada`);

      } catch (notifError) {
        console.error('Error al enviar notificaciones:', notifError);
        console.error('Stack:', notifError.stack);
        // No fallar la operación si falla la notificación
      }
    }

    res.json({
      message: "Participante agregado exitosamente",
      detalles,
      curso
    });

  } catch (error) {
    console.error('Error al agregar participante:', error);
    console.error('Stack:', error.stack);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Ya existe un usuario con esta cédula o correo"
      });
    }

    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// REMOVER PARTICIPANTE DEL CURSO
export const removerParticipante = async (req, res) => {
  try {
    const { id, usuarioId } = req.params;

    const curso = await Curso.findById(id);
    if (!curso) {
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    // No permitir remover al docente principal
    if (curso.docenteId.toString() === usuarioId) {
      return res.status(400).json({
        message: "No se puede remover al docente principal del curso"
      });
    }

    if (!curso.esParticipante(usuarioId)) {
      return res.status(400).json({
        message: "El usuario no es participante de este curso"
      });
    }

    curso.removerParticipante(usuarioId);
    await curso.save();

    await curso.populate('participantes.usuarioId', 'nombre apellido correo rol');

    res.json({
      message: "Participante removido exitosamente",
      curso
    });

  } catch (error) {
    console.error('Error al remover participante:', error);
    res.status(500).json({
      message: "Error interno del servidor"
    });
  }
};

// REGISTRAR USUARIOS MASIVAMENTE DESDE CSV
export const registrarUsuariosMasivo = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioLogueado = req.user;

    if (!req.file) {
      return res.status(400).json({
        message: "No se ha subido ningún archivo CSV"
      });
    }

    const curso = await Curso.findById(id);
    if (!curso) {
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    if (usuarioLogueado.rol === 'docente' && curso.docenteId.toString() !== usuarioLogueado.userId) {
      return res.status(403).json({
        message: "No tienes permisos para agregar usuarios a este curso"
      });
    }

    const resultadosCarga = await procesarUsuariosCSV(req.file, id);

    res.status(200).json({
      message: "Proceso de registro masivo completado",
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

// OBTENER PARTICIPANTES DE UN CURSO (para selección en tareas)
export const getParticipantesCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const { etiqueta, search, page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "ID de curso no válido"
      });
    }

    const curso = await Curso.findById(id)
      .populate({
        path: 'participantes.usuarioId',
        select: 'nombre apellido correo telefono rol estado fotoPerfilUrl'
      });

    if (!curso) {
      return res.status(404).json({
        message: "Curso no encontrado"
      });
    }

    // Filtrar participantes
    let participantes = curso.participantes.filter(p => p.usuarioId !== null);

    // Filtrar por etiqueta (padre, docente)
    if (etiqueta) {
      participantes = participantes.filter(p => p.etiqueta === etiqueta);
    }

    // Buscar por nombre, apellido o correo
    if (search) {
      const searchLower = search.toLowerCase();
      participantes = participantes.filter(p => {
        const usuario = p.usuarioId;
        return (
          usuario.nombre.toLowerCase().includes(searchLower) ||
          usuario.apellido.toLowerCase().includes(searchLower) ||
          usuario.correo.toLowerCase().includes(searchLower)
        );
      });
    }

    // Paginación
    const skip = (page - 1) * limit;
    const total = participantes.length;
    const paginados = participantes.slice(skip, skip + parseInt(limit));

    // Formatear respuesta
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