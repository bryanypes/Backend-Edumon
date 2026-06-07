import Modulo from '../models/Modulo.js';
import Tarea from '../models/Tarea.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';

// ─── Helper: adjunta tareas a un array de módulos ─────────────────────────
const poblarTareas = async (modulos) => {
  return Promise.all(
    modulos.map(async (modulo) => {
      const tareas = await Tarea.find({ moduloId: modulo._id })
        .select('titulo descripcion fechaEntrega tipoEntrega estado etiquetas asignacionTipo criterios archivosAdjuntos')
        .sort({ fechaEntrega: 1 })
        .lean();

      return { ...modulo.toObject(), tareas };
    })
  );
};

// Crear módulo
export const createModulo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { cursoId, titulo, descripcion } = req.body;

    if (!mongoose.Types.ObjectId.isValid(cursoId)) {
      return res.status(400).json({ message: "El ID del curso no es válido" });
    }

    const newModulo = new Modulo({ cursoId, titulo, descripcion });
    const savedModulo = await newModulo.save();

    await savedModulo.populate('cursoId', 'nombre descripcion fotoPortadaUrl docenteId participantes estado fechaCreacion');

    res.status(201).json({
      message: "Módulo creado exitosamente",
      modulo: savedModulo
    });
  } catch (error) {
    console.error('Error al crear módulo:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Listar módulos con paginación, filtro por curso e incluye tareas
export const getModulos = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip  = (page - 1) * limit;
    const { cursoId, incluirInactivos } = req.query;

    const filter = {};

    if (incluirInactivos !== 'true') {
      filter.estado = { $ne: 'inactivo' };
    }

    if (cursoId) {
      if (!mongoose.Types.ObjectId.isValid(cursoId)) {
        return res.status(400).json({ message: "El ID del curso no es válido" });
      }
      filter.cursoId = cursoId;
    }

    const modulos = await Modulo.find(filter)
      .populate({
        path: 'cursoId',
        select: 'nombre descripcion fotoPortadaUrl docenteId participantes estado fechaCreacion',
        populate: [
          {
            path: 'docenteId',
            select: 'nombre apellido correo fotoPerfilUrl'
          },
          {
            path: 'participantes.usuarioId',
            select: 'nombre apellido correo rol fotoPerfilUrl'
          }
        ]
      })
      .skip(skip)
      .limit(limit)
      .sort({ fechaCreacion: -1 });

    const total = await Modulo.countDocuments(filter);

    const modulosConTareas = await poblarTareas(modulos);

    res.json({
      modulos: modulosConTareas,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalModulos: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener módulos:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Obtener módulo por ID
export const getModuloById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "El ID del módulo no es válido" });
    }

    const modulo = await Modulo.findById(req.params.id)
      .populate('cursoId', 'nombre descripcion fotoPortadaUrl docenteId participantes estado fechaCreacion');

    if (!modulo) {
      return res.status(404).json({ message: "Módulo no encontrado" });
    }

    const tareas = await Tarea.find({ moduloId: modulo._id })
      .select('titulo descripcion fechaEntrega tipoEntrega estado etiquetas asignacionTipo criterios archivosAdjuntos')
      .sort({ fechaEntrega: 1 })
      .lean();

    res.json({ ...modulo.toObject(), tareas });
  } catch (error) {
    console.error('Error al obtener módulo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Obtener módulos por curso (incluye tareas)
export const getModulosByCurso = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { cursoId } = req.params;
    const { incluirInactivos } = req.query;

    if (!mongoose.Types.ObjectId.isValid(cursoId)) {
      return res.status(400).json({ message: "El ID del curso no es válido" });
    }

    const filter = { cursoId };

    if (incluirInactivos !== 'true') {
      filter.estado = { $ne: 'inactivo' };
    }

    const modulos = await Modulo.find(filter).sort({ fechaCreacion: -1 });

    const modulosConTareas = await poblarTareas(modulos);

    res.json({
      modulos: modulosConTareas,
      total: modulosConTareas.length
    });
  } catch (error) {
    console.error('Error al obtener módulos por curso:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Actualizar módulo
export const updateModulo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "El ID del módulo no es válido" });
    }

    const { _id, fechaCreacion, ...updateData } = req.body;

    const updatedModulo = await Modulo.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('cursoId', 'nombre descripcion fotoPortadaUrl docenteId participantes estado fechaCreacion');

    if (!updatedModulo) {
      return res.status(404).json({ message: "Módulo no encontrado" });
    }

    res.json({
      message: "Módulo actualizado exitosamente",
      modulo: updatedModulo
    });
  } catch (error) {
    console.error('Error al actualizar módulo:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Eliminar módulo (soft delete)
export const deleteModulo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "El ID del módulo no es válido" });
    }

    const updatedModulo = await Modulo.findByIdAndUpdate(
      id,
      { estado: 'inactivo' },
      { new: true }
    );

    if (!updatedModulo) {
      return res.status(404).json({ message: "Módulo no encontrado" });
    }

    res.json({
      message: "Módulo desactivado exitosamente",
      modulo: updatedModulo
    });
  } catch (error) {
    console.error('Error al desactivar módulo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Desarchivar módulo (reactivar)
export const restoreModulo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Errores de validación",
        errors: errors.array()
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "El ID del módulo no es válido" });
    }

    const modulo = await Modulo.findById(id);

    if (!modulo) {
      return res.status(404).json({ message: "Módulo no encontrado" });
    }

    if (modulo.estado === 'activo') {
      return res.status(400).json({ message: "El módulo ya está activo" });
    }

    modulo.estado = 'activo';
    await modulo.save();

    await modulo.populate('cursoId', 'nombre descripcion fotoPortadaUrl docenteId participantes estado fechaCreacion');

    res.json({
      message: "Módulo reactivado exitosamente",
      modulo
    });
  } catch (error) {
    console.error('Error al reactivar módulo:', error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};