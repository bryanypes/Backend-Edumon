import Institucion from '../models/Institucion.js';
import User from '../models/User.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';
import { AVATAR_PREDETERMINADO } from '../utils/avatarPredeterminado.js';

import csv from 'csv-parser';
import { Readable } from 'stream';
import { getFileBuffer } from '../utils/fileUploadHelper.js';

// Admin del colegio: preregistrar docentes masivamente desde CSV
export const preregistrarDocentesCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se ha subido ningún archivo CSV' });
    }

    const admin = await User.findById(req.user.userId);
    if (!admin.institucionId) {
      return res.status(400).json({ message: 'No tienes institución asignada' });
    }

    const institucionId = admin.institucionId;
    const resultados = { exitosos: [], errores: [], duplicados: [] };
    const usuarios = [];

    const fileBuffer = await getFileBuffer(req.file);
    if (!fileBuffer) {
      return res.status(400).json({ message: 'No se pudo leer el archivo CSV' });
    }

    // Parsear CSV
    const stream = Readable.from(fileBuffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          headers: ['nombre', 'apellido', 'telefono', 'cedula'],
          skipEmptyLines: true
        }))
        .on('data', (data) => {
          // Saltar fila de headers
          if (data.nombre === 'nombre' && data.apellido === 'apellido') return;
          if (data.nombre && data.apellido && data.cedula) {
            usuarios.push({
              nombre: data.nombre.trim(),
              apellido: data.apellido.trim(),
              telefono: normalizarTelefono(data.telefono) || data.telefono?.trim() || '',
              cedula: data.cedula.trim()
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`[CSV Docentes] Total a procesar: ${usuarios.length}`);

    for (const userData of usuarios) {
  try {
    const { nombre, apellido, telefono, cedula } = userData;
    const correoFinal = `${cedula}@temp.com`;
    const telefonoNormalizado = normalizarTelefono(telefono) || telefono;

    const existe = await User.findOne({
      $or: [{ cedula }, { correo: correoFinal }]
    });

    if (existe) {
      if (existe.institucionId?.toString() === institucionId.toString()) {
        resultados.duplicados.push({
          nombre: `${existe.nombre} ${existe.apellido}`,
          cedula,
          motivo: 'Ya está registrado en esta institución'
        });
      } else if (existe.institucionId) {
        resultados.errores.push({
          nombre: `${existe.nombre} ${existe.apellido}`,
          cedula,
          motivo: 'Ya pertenece a otra institución'
        });
      } else {
        // Existe pero sin institución — la asignamos en vez de crear un duplicado
        existe.institucionId = institucionId;
        if (telefonoNormalizado) existe.telefono = telefonoNormalizado;
        await existe.save();
        eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, existe);
        resultados.exitosos.push({
          nombre: `${existe.nombre} ${existe.apellido}`,
          cedula,
          accion: 'Usuario existente asignado a la institución'
        });
      }
      continue;
    }

    const docente = new User({
      nombre,
      apellido,
      cedula,
      telefono: telefonoNormalizado,
      correo: correoFinal,
      contraseña: cedula,
      rol: 'docente',
      estado: 'activo',
      institucionId,
      fotoPerfilUrl: AVATAR_PREDETERMINADO
    });

    await docente.save();
    eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, docente);

    resultados.exitosos.push({
      nombre: `${docente.nombre} ${docente.apellido}`,
      cedula,
      accion: 'Docente creado y asignado a la institución'
    });

  } catch (error) {
    if (error.code === 11000) {
      resultados.duplicados.push({
        datos: userData,
        motivo: 'Cédula o correo duplicado en el sistema'
      });
    } else {
      resultados.errores.push({
        datos: userData,
        error: error.message
      });
    }
  }
}

    res.status(200).json({
      message: 'Proceso de registro masivo de docentes completado',
      resumen: {
        total: usuarios.length,
        exitosos: resultados.exitosos.length,
        duplicados: resultados.duplicados.length,
        errores: resultados.errores.length
      },
      detalles: resultados
    });

  } catch (error) {
    console.error('[preregistrarDocentesCSV]', error);
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Superadmin: crear institución + admin del colegio
export const crearInstitucion = async (req, res) => {
  try {
    const {
      nombre, nit, direccion, telefono, correo,
      // Datos del admin del colegio
      adminNombre, adminApellido, adminCedula, adminCorreo, adminTelefono
    } = req.body;

    // Verificar que el NIT no exista (findOne({ nit: undefined }) matchearía
    // cualquier institución, así que solo se consulta si viene informado)
    if (nit) {
      const existe = await Institucion.findOne({ nit });
      if (existe) {
        return res.status(400).json({ message: 'Ya existe una institución con ese NIT' });
      }
    }

    // Crear institución primero (sin adminId)
    const institucion = new Institucion({ nombre, nit, direccion, telefono, correo });
    await institucion.save();

    // Crear usuario administrador del colegio
    const adminCorreoFinal = adminCorreo || `${adminCedula}@${institucion.codigo.toLowerCase()}.edu`;
    const admin = new User({
      nombre: adminNombre,
      apellido: adminApellido,
      cedula: adminCedula,
      correo: adminCorreoFinal,
      telefono: adminTelefono,
      contraseña: adminCedula, // cédula como contraseña inicial
      rol: 'administrador',
      estado: 'activo',
      institucionId: institucion._id,
      fotoPerfilUrl: AVATAR_PREDETERMINADO
    });

    await admin.save();

    // Vincular admin a la institución
    institucion.adminId = admin._id;
    await institucion.save();

    // Disparar evento de bienvenida (Observer lo captura)
    eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, admin);

    res.status(201).json({
      message: 'Institución creada exitosamente',
      institucion,
      admin: {
        _id: admin._id,
        nombre: admin.nombre,
        apellido: admin.apellido,
        correo: admin.correo,
        codigoInstitucion: institucion.codigo
      }
    });
  } catch (error) {
    console.error('[crearInstitucion]', error);

    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern || {})[0] || 'dato';
      return res.status(400).json({ message: `Ya existe un registro con ese ${campo}` });
    }
    if (error.name === 'ValidationError') {
      const mensaje = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ message: mensaje });
    }

    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Listar instituciones (solo superadmin)
export const getInstituciones = async (req, res) => {
  try {
    const instituciones = await Institucion.find({ activo: true })
      .populate('adminId', 'nombre apellido correo')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ instituciones });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Obtener mi institución (admin del colegio)
export const getMiInstitucion = async (req, res) => {
  try {
    const usuario = await User.findById(req.user.userId).select('institucionId').lean();
    if (!usuario.institucionId) {
      return res.status(404).json({ message: 'No tienes institución asignada' });
    }

    const institucion = await Institucion.findById(usuario.institucionId)
      .populate('adminId', 'nombre apellido correo')
      .lean();

    res.json({ institucion });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Admin del colegio: preregistrar docente
export const preregistrarDocente = async (req, res) => {
  try {
    const { nombre, apellido, cedula, correo, telefono } = req.body;
    const admin = await User.findById(req.user.userId);

    if (!admin.institucionId) {
      return res.status(400).json({ message: 'No tienes institución asignada' });
    }

    const correoFinal = correo || `${cedula}@temp.com`;

    const docente = new User({
      nombre,
      apellido,
      cedula,
      correo: correoFinal,
      telefono,
      contraseña: cedula,
      rol: 'docente',
      estado: 'activo',
      institucionId: admin.institucionId,
      fotoPerfilUrl: AVATAR_PREDETERMINADO
    });

    await docente.save();

    eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, docente);

    res.status(201).json({
      message: 'Docente preregistrado exitosamente',
      docente: {
        _id: docente._id,
        nombre: docente.nombre,
        apellido: docente.apellido,
        correo: docente.correo,
        rol: docente.rol
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ya existe un usuario con esa cédula o correo' });
    }
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Actualizar institución
export const updateInstitucion = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, direccion, telefono, correo } = req.body;

    const institucion = await Institucion.findByIdAndUpdate(
      id,
      { nombre, direccion, telefono, correo },
      { new: true, runValidators: true }
    ).populate('adminId', 'nombre apellido correo').lean();

    if (!institucion) {
      return res.status(404).json({ message: 'Institución no encontrada' });
    }

    res.json({ message: 'Institución actualizada', institucion });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Activar/desactivar institución. El campo "activo" existía en el schema y
// getInstituciones ya filtra por activo:true, pero nada lo cambiaba nunca.
export const cambiarEstadoInstitucion = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ message: 'El campo "activo" debe ser true o false' });
    }

    const institucion = await Institucion.findByIdAndUpdate(
      id,
      { activo },
      { new: true }
    ).populate('adminId', 'nombre apellido correo').lean();

    if (!institucion) {
      return res.status(404).json({ message: 'Institución no encontrada' });
    }

    res.json({
      message: `Institución ${activo ? 'activada' : 'desactivada'} exitosamente`,
      institucion
    });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};