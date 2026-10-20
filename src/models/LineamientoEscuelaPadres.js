import mongoose from 'mongoose';
import { EJES_CRIANZA } from '../config/edumonIA.js';

// Lineamientos de escuela de padres de una institución: lo que pidió el
// Ministerio o la Secretaría + cómo quiere el rector o coordinador que los
// docentes gestionen los retos en cada grupo. Edumon los redacta; el admin los
// edita en "borrador" y al publicar se copian a "publicado", que es lo que ven
// los docentes y lo que usa el asistente de retos.

const periodoSchema = new mongoose.Schema({
  nombre: { type: String, trim: true, maxlength: 60, required: true },
  inicio: { type: Date, default: null },
  fin: { type: Date, default: null },
}, { _id: false });

const porCursoSchema = new mongoose.Schema({
  cursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curso', required: true },
  temasPrioritarios: { type: [{ type: String, trim: true, maxlength: 150 }], default: [] },
  indicaciones: { type: String, trim: true, maxlength: 800, default: '' },
  // null = la meta general del colegio
  retosPorPeriodo: { type: Number, min: 0, max: 20, default: null },
}, { _id: false });

const contenidoSchema = new mongoose.Schema({
  resumenComunicado: { type: String, trim: true, maxlength: 3000, default: '' },
  objetivo: { type: String, trim: true, maxlength: 800, default: '' },
  ejesObligatorios: { type: [{ type: String, enum: EJES_CRIANZA }], default: [] },
  retosPorPeriodo: { type: Number, min: 0, max: 20, default: 1 },
  // Ley 2025 de 2020: mínimo 3 encuentros de escuela de padres al año
  encuentrosPorAnio: { type: Number, min: 0, max: 50, default: 3 },
  periodos: { type: [periodoSchema], default: [] },
  formatoEntrega: { type: String, trim: true, maxlength: 800, default: '' },
  indicacionesDocentes: { type: [{ type: String, trim: true, maxlength: 400 }], default: [] },
  porCurso: { type: [porCursoSchema], default: [] },
  // lo que el comunicado no define y el admin debería decidir
  pendientesPorDefinir: { type: [{ type: String, trim: true, maxlength: 300 }], default: [] },
  mensajeDocentes: { type: String, trim: true, maxlength: 1500, default: '' },
}, { _id: false });

const lineamientoSchema = new mongoose.Schema({
  institucionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institucion', required: true, unique: true },
  fuente: {
    texto: { type: String, maxlength: 60000, default: '' },
    archivoNombre: { type: String, trim: true, default: null },
    instrucciones: { type: String, trim: true, maxlength: 3000, default: '' },
  },
  borrador: { type: contenidoSchema, default: () => ({}) },
  publicado: { type: contenidoSchema, default: null },
  generadoPor: { type: String, enum: ['ia', 'plantilla', 'manual'], default: 'manual' },
  version: { type: Number, default: 0 },
  publicadoEn: { type: Date, default: null },
  publicadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export default mongoose.model('LineamientoEscuelaPadres', lineamientoSchema);
