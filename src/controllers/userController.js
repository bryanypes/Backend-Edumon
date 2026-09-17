import User from '../models/User.js';
import Curso from '../models/Curso.js';
import { validationResult } from 'express-validator';
import fs from 'node:fs/promises';
import { subirImagenCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { AVATAR_PREDETERMINADO } from '../utils/avatarPredeterminado.js';
import { AVATARES_DIR, AVATARES_PREFIX } from '../config/almacenamiento.js';
import { getFileBuffer } from '../utils/fileUploadHelper.js';

// Un administrador solo puede gestionar/ver usuarios de SU institución; el
// superadmin no tiene restricción. Antes cualquier admin operaba sobre usuarios
// de cualquier institución vía /users/:id.
// Un padre no tiene institucionId propio (ver comentario en getUsers), así
// que para ese caso se revisa si participa en algún curso de la institución
// del admin -- si no, un admin veía padres en la lista de getUsers pero
// recibía 403 al intentar abrir/editar/suspender cualquiera de ellos.
async function adminPuedeGestionarUsuario(actor, objetivo) {
  if (actor.rol === 'superadmin') return true;
  if (actor.rol !== 'administrador') return false;

  if (objetivo.rol === 'padre') {
    return await Curso.exists({
      institucionId: actor.institucionId,
      'participantes.usuarioId': objetivo._id,
    });
  }

  return !!objetivo.institucionId &&
    objetivo.institucionId.toString() === actor.institucionId;
}

// Crear usuario (desde panel de administración)
export const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { nombre, apellido, cedula, correo, contraseña, rol, telefono, institucionId } = req.body;

    // Un administrador solo puede crear padres/docentes DE SU institución.
    // Sin esto podía crear otros administradores (o el superadmin, si no existía)
    // y colocar docentes en instituciones ajenas.
    if (req.user.rol === 'administrador') {
      if (!['padre', 'docente'].includes(rol)) {
        return res.status(403).json({ message: "Un administrador solo puede crear usuarios con rol 'padre' o 'docente'" });
      }
      if (!req.user.institucionId) {
        return res.status(400).json({ message: "No tienes institución asignada" });
      }
    }

    // findOne(undefined) matchea el primer doc de la colección, por eso solo
    // se busca si el campo realmente viene en el body
    const [superadminExistente, existingCedula, existingCorreo, existingTelefono] = await Promise.all([
      rol === 'superadmin' ? User.findOne({ rol: 'superadmin' }) : null,
      User.findOne({ cedula }),
      correo   ? User.findOne({ correo })   : null,
      telefono ? User.findOne({ telefono }) : null,
    ]);

    if (rol === 'superadmin' && superadminExistente) {
      return res.status(409).json({
        message: "Ya existe un superadmin en el sistema. Solo puede haber uno."
      });
    }

    if (existingCedula) {
      return res.status(409).json({ message: "Ya existe un usuario con esta cédula" });
    }

    if (correo && existingCorreo) {
      return res.status(409).json({ message: "Ya existe un usuario con este correo electrónico" });
    }

    if (telefono && existingTelefono) {
      return res.status(409).json({ message: "Ya existe un usuario con este teléfono" });
    }

    let institucionFinal = null;
    if (rol === 'docente' || rol === 'administrador') {
      // el admin no puede elegir institución: siempre la suya
      institucionFinal = req.user.rol === 'administrador' ? req.user.institucionId : institucionId;
    }

    // contraseña inicial = cédula, salvo que se envíe una explícita (misma regla en todo el sistema)
    const contraseñaInicial = contraseña?.trim() || String(cedula).trim();

    const newUser = new User({
      nombre,
      apellido,
      cedula,
      correo,
      contraseña: contraseñaInicial,
      rol,
      telefono,
      institucionId: institucionFinal,
      fotoPerfilUrl: AVATAR_PREDETERMINADO
    });

    const savedUser = await newUser.save();

    res.status(201).json({
      message: "Usuario creado exitosamente",
      user: savedUser
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip  = (page - 1) * limit;
    const { rol, estado } = req.query;

    const filter = {};
    if (rol)    filter.rol    = rol;
    if (estado) filter.estado = estado;

    // el admin solo ve usuarios de su institución; el superadmin ve todos.
    // Un padre NUNCA tiene institucionId propio (solo queda ligado vía los
    // cursos en los que participa) -- filtrar solo por institucionId dejaba
    // esta lista sin padres siempre, para cualquier admin. Se agregan por
    // separado, vía los cursos de la institución.
    if (req.user.rol === 'administrador') {
      const padresIds = await Curso.find({ institucionId: req.user.institucionId })
        .distinct('participantes.usuarioId');

      filter.$or = [
        { institucionId: req.user.institucionId },
        { _id: { $in: padresIds }, rol: 'padre' },
      ];
    }

    const users = await User.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ fechaRegistro: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getUserById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!(await adminPuedeGestionarUsuario(req.user, user))) {
      return res.status(403).json({ message: "No puedes ver usuarios de otra institución" });
    }

    res.json(user);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Obtener perfil del usuario autenticado
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Actualizar usuario (NO incluye contraseña — usar ruta dedicada)
export const updateUser = async (req, res) => {
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

    if (!id) {
      return res.status(400).json({ message: 'ID de usuario requerido' });
    }

    const usuarioObjetivo = await User.findById(id);
    if (!usuarioObjetivo) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (!(await adminPuedeGestionarUsuario(req.user, usuarioObjetivo))) {
      return res.status(403).json({ message: "No puedes modificar usuarios de otra institución" });
    }

    // campos protegidos, nunca se actualizan por esta ruta
    delete updateData.contraseña;
    delete updateData._id;
    delete updateData.fechaRegistro;
    delete updateData.modoOscuro; // se maneja por su propia ruta
    delete updateData.estado;     // se maneja por DELETE /:id (suspender) y /:id/reactivar, que sí validan cursos activos etc.
    delete updateData.esTitular;

    // Cambiar rol/institución: antes se borraban sin más (updateUser nunca
    // los tocaba), así que un superadmin no tenía forma de ascender a un padre
    // a administrador -- el PUT respondía 200 "actualizado" pero el rol
    // quedaba igual, sin ningún aviso. Misma regla que createUser: un
    // administrador solo puede asignar 'padre'/'docente' dentro de su propia
    // institución; solo superadmin puede asignar 'administrador'/'superadmin',
    // y sigue existiendo un único superadmin en el sistema.
    if (updateData.rol !== undefined || updateData.institucionId !== undefined) {
      const nuevoRol = updateData.rol ?? usuarioObjetivo.rol;

      if (req.user.rol === 'administrador' && !['padre', 'docente'].includes(nuevoRol)) {
        return res.status(403).json({ message: "Un administrador solo puede asignar el rol 'padre' o 'docente'" });
      }

      if (nuevoRol === 'superadmin') {
        const superadminExistente = await User.findOne({ rol: 'superadmin', _id: { $ne: id } });
        if (superadminExistente) {
          return res.status(409).json({ message: "Ya existe un superadmin en el sistema. Solo puede haber uno." });
        }
      }

      updateData.rol = nuevoRol;
      if (nuevoRol === 'docente' || nuevoRol === 'administrador') {
        updateData.institucionId = req.user.rol === 'administrador'
          ? req.user.institucionId
          : (updateData.institucionId ?? usuarioObjetivo.institucionId);
        if (!updateData.institucionId) {
          return res.status(400).json({ message: "La institución es requerida para docentes y administradores" });
        }
      } else {
        updateData.institucionId = null;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      message: "Usuario actualizado exitosamente",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Actualizar el propio perfil (nombre/apellido/correo/telefono) —
// nunca rol/estado/institucionId, esos quedan reservados a administradores
export const updateOwnProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { userId } = req.user; // nunca desde req.params — así nadie edita a otro
    const { nombre, apellido, correo, telefono } = req.body; // whitelist explícita

    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const [existingCorreo, existingTelefono] = await Promise.all([
      correo   ? User.findOne({ correo, _id: { $ne: userId } })   : null,
      telefono ? User.findOne({ telefono, _id: { $ne: userId } }) : null,
    ]);

    if (correo && existingCorreo) {
      return res.status(409).json({ message: "Ya existe un usuario con este correo electrónico" });
    }
    if (telefono && existingTelefono) {
      return res.status(409).json({ message: "Ya existe un usuario con este teléfono" });
    }

    const updateData = {};
    if (nombre   !== undefined) updateData.nombre   = nombre;
    if (apellido !== undefined) updateData.apellido = apellido;
    if (correo   !== undefined) updateData.correo   = correo;
    if (telefono !== undefined) updateData.telefono = telefono;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      message: "Perfil actualizado exitosamente",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error al actualizar el propio perfil:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Eliminar usuario (soft delete → estado: suspendido)
export const deleteUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const userASuspender = await User.findById(id);
    if (!userASuspender) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!(await adminPuedeGestionarUsuario(req.user, userASuspender))) {
      return res.status(403).json({ message: "No puedes suspender usuarios de otra institución" });
    }

    // bloquear suspensión si el docente tiene cursos activos, para no dejarlos huérfanos
    if (userASuspender.rol === 'docente') {
      const cursosActivos = await Curso.find({ docenteId: id, estado: 'activo' })
        .select('nombre codigoCurso')
        .lean();

      if (cursosActivos.length > 0) {
        return res.status(400).json({
          message: "No se puede suspender: el docente tiene cursos activos. Reasigna o archiva estos cursos primero.",
          cursosActivos
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { estado: 'suspendido' },
      { new: true }
    );

    res.json({
      message: "Usuario suspendido exitosamente",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error al suspender usuario:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Reactivar usuario (revierte el soft delete → estado: activo)
export const reactivateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (!(await adminPuedeGestionarUsuario(req.user, user))) {
      return res.status(403).json({ message: "No puedes reactivar usuarios de otra institución" });
    }
    if (user.estado === 'activo') {
      return res.status(400).json({ message: "El usuario ya está activo" });
    }

    user.estado = 'activo';
    await user.save();

    res.json({
      message: "Usuario reactivado exitosamente",
      user
    });
  } catch (error) {
    console.error('Error al reactivar usuario:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getFotosPredeterminadas = async (req, res) => {
  try {
    const EXT_VALIDAS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const archivos = (await fs.readdir(AVATARES_DIR))
      .filter((a) => EXT_VALIDAS.includes(a.slice(a.lastIndexOf('.')).toLowerCase()))
      .sort();

    const fotos = archivos.map((nombre) => ({
      url: `${AVATARES_PREFIX}/${nombre}`,
      publicId: `avatares/${nombre}`,
      nombre,
    }));

    res.json({
      message: "Fotos predeterminadas obtenidas exitosamente",
      fotos
    });
  } catch (error) {
    console.error('Error al obtener fotos predeterminadas:', error);
    res.status(500).json({ message: "Error al obtener fotos predeterminadas" });
  }
};

// Actualizar foto de perfil (predeterminada o nueva)
export const updateFotoPerfil = async (req, res) => {
  try {
    const { userId } = req.user;
    const { fotoPredeterminadaUrl } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    let nuevaFotoUrl = null;

    if (fotoPredeterminadaUrl) {
      nuevaFotoUrl = fotoPredeterminadaUrl;
    } else if (req.file) {
      // solo se borra si era un archivo subido (/uploads/...), no un avatar predeterminado
      if (user.fotoPerfilUrl && user.fotoPerfilUrl.startsWith('/uploads/')) {
        await eliminarArchivoCloudinary(user.fotoPerfilUrl.replace('/uploads/', ''));
      }

      const fileBuffer = await getFileBuffer(req.file);
      if (!fileBuffer) {
        return res.status(400).json({ message: 'No se pudo leer la imagen de perfil' });
      }

      const resultado = await subirImagenCloudinary(
        fileBuffer,
        req.file.mimetype,
        'fotos-perfil-usuarios'
      );
      nuevaFotoUrl = resultado.url;
    } else {
      return res.status(400).json({
        message: "Debes seleccionar una foto predeterminada o subir una nueva"
      });
    }

    user.fotoPerfilUrl = nuevaFotoUrl;
    await user.save();

    res.json({
      message: "Foto de perfil actualizada exitosamente",
      fotoPerfilUrl: nuevaFotoUrl
    });
  } catch (error) {
    console.error('Error al actualizar foto de perfil:', error);
    res.status(500).json({
      message: "Error al actualizar foto de perfil",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateFcmToken = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { userId } = req.user;
    const { fcmToken } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        fcmToken,
        fcmTokenActualizadoEn: new Date()
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      message: "Token FCM actualizado exitosamente",
      fcmToken,
      actualizadoEn: user.fcmTokenActualizadoEn
    });
  } catch (error) {
    console.error('Error al actualizar FCM token:', error);
    res.status(500).json({
      message: "Error al actualizar el token FCM",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateModoOscuro = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { userId } = req.user;
    const { modoOscuro } = req.body;

    if (typeof modoOscuro !== 'boolean') {
      return res.status(400).json({
        message: "El campo modoOscuro debe ser un booleano (true o false)"
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { modoOscuro },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      message: `Modo ${modoOscuro ? 'oscuro' : 'claro'} activado exitosamente`,
      modoOscuro: user.modoOscuro
    });
  } catch (error) {
    console.error('Error al actualizar modo de pantalla:', error);
    res.status(500).json({
      message: "Error al actualizar el modo de pantalla",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getUltimasSesiones = async (req, res) => {
  try {
    const { userId, rol } = req.user;

    if (rol !== 'superadmin') {
      const user = await User.findById(userId).select('nombre apellido correo rol ultimoAcceso').lean();
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

      return res.json({ ultimoAcceso: user.ultimoAcceso });
    }

    const page  = parseInt(req.query.page)  || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip  = (page - 1) * limit;

    const users = await User.find({})
      .select('nombre apellido correo rol ultimoAcceso estado')
      .sort({ ultimoAcceso: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments();

    return res.json({
      sesiones: users.map(u => ({
        userId: u._id,
        nombre: `${u.nombre} ${u.apellido}`,
        correo: u.correo,
        rol: u.rol,
        estado: u.estado,
        ultimoAcceso: u.ultimoAcceso ?? null
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsuarios: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener últimas sesiones:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const getPadreInfo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { padreId } = req.params;

    const padre = await User.findById(padreId).select(
      'nombre apellido cedula correo telefono rol estado esTitular institucionId ' +
      'fotoPerfilUrl fechaRegistro ultimoAcceso primerInicioSesion preferencias modoOscuro'
    ).lean();

    if (!padre) {
      return res.status(404).json({ message: "Padre/acudiente no encontrado" });
    }

    if (padre.rol !== 'padre') {
      return res.status(400).json({ message: "El usuario no tiene rol de padre/acudiente" });
    }

    // sin esto, cualquier usuario autenticado consultaba la cédula/correo/teléfono
    // de cualquier padre por su id. Acceso: el propio padre, un docente que comparte
    // curso con él, un admin de su institución, o el superadmin.
    const { userId, rol, institucionId } = req.user;
    let autorizado = rol === 'superadmin' || (rol === 'padre' && padreId === userId);

    if (!autorizado && rol === 'docente') {
      autorizado = await Curso.exists({ docenteId: userId, 'participantes.usuarioId': padreId });
    }
    if (!autorizado && rol === 'administrador') {
      autorizado = (padre.institucionId?.toString() === institucionId)
        || await Curso.exists({ institucionId, 'participantes.usuarioId': padreId });
    }
    if (!autorizado) {
      return res.status(403).json({ message: "No tienes permiso para ver la información de este padre/acudiente" });
    }

    res.json({
      message: "Información del padre obtenida exitosamente",
      padre: {
        id: padre._id,
        nombre: padre.nombre,
        apellido: padre.apellido,
        nombreCompleto: `${padre.nombre} ${padre.apellido}`,
        cedula: padre.cedula,
        correo: padre.correo ?? null,
        telefono: padre.telefono ?? null,
        fotoPerfilUrl: padre.fotoPerfilUrl ?? null,
        estado: padre.estado,
        esTitular: padre.esTitular,
        primerInicioSesion: padre.primerInicioSesion,
        preferencias: padre.preferencias,
        modoOscuro: padre.modoOscuro,
        fechaRegistro: padre.fechaRegistro,
        ultimoAcceso: padre.ultimoAcceso ?? null,
      }
    });
  } catch (error) {
    console.error('Error al obtener info del padre:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};