// src/controllers/institucionController.js
import Institucion from '../models/Institucion.js';
import User from '../models/User.js';
import { eventBus, EVENTOS } from '../events/EventBus.js';
import { normalizarTelefono } from '../utils/normalizarTelefono.js';

import csv from 'csv-parser';
import { Readable } from 'stream';

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

    // Parsear CSV
    const stream = Readable.from(req.file.buffer.toString());

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

    // Buscar si ya existe
    const existe = await User.findOne({
      $or: [{ cedula }, { correo: correoFinal }]
    });

    if (existe) {
      // Ya existe en el sistema
      if (existe.institucionId?.toString() === institucionId.toString()) {
        // Ya pertenece a ESTA institución
        resultados.duplicados.push({
          nombre: `${existe.nombre} ${existe.apellido}`,
          cedula,
          motivo: 'Ya está registrado en esta institución'
        });
      } else if (existe.institucionId) {
        // Pertenece a OTRA institución
        resultados.errores.push({
          nombre: `${existe.nombre} ${existe.apellido}`,
          cedula,
          motivo: 'Ya pertenece a otra institución'
        });
      } else {
        // Existe pero sin institución — asignar
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

    // No existe — crear
    const docente = new User({
      nombre,
      apellido,
      cedula,
      telefono: telefonoNormalizado,
      correo: correoFinal,
      contraseña: cedula,
      rol: 'docente',
      estado: 'activo',
      institucionId
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

    // Verificar que el NIT no exista
    const existe = await Institucion.findOne({ nit });
    if (existe) {
      return res.status(400).json({ message: 'Ya existe una institución con ese NIT' });
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
      institucionId: institucion._id
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
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Listar instituciones (solo superadmin)
export const getInstituciones = async (req, res) => {
  try {
    const instituciones = await Institucion.find({ activo: true })
      .populate('adminId', 'nombre apellido correo')
      .sort({ createdAt: -1 });

    res.json({ instituciones });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};

// Obtener mi institución (admin del colegio)
export const getMiInstitucion = async (req, res) => {
  try {
    const usuario = await User.findById(req.user.userId);
    if (!usuario.institucionId) {
      return res.status(404).json({ message: 'No tienes institución asignada' });
    }

    const institucion = await Institucion.findById(usuario.institucionId)
      .populate('adminId', 'nombre apellido correo');

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
      institucionId: admin.institucionId
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
    ).populate('adminId', 'nombre apellido correo');

    if (!institucion) {
      return res.status(404).json({ message: 'Institución no encontrada' });
    }

    res.json({ message: 'Institución actualizada', institucion });
  } catch (error) {
    res.status(500).json({ message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error.message : undefined});
  }
};