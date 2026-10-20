import mongoose from 'mongoose';
import { CATEGORIAS_RIESGO } from '../config/edumonIA.js';
import deteccionIASchema from './schemas/deteccionIASchema.js';

// cada cambio de la alerta: creación, cambio de estado o nota; por = null es Edumon
const historialSchema = new mongoose.Schema({
  accion: { type: String, enum: ['creada', 'estado', 'nota'], required: true },
  estado: { type: String, enum: ['nueva', 'en_atencion', 'cerrada'], default: null },
  nota: { type: String, trim: true, maxlength: 2000, default: '' },
  por: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  en: { type: Date, default: Date.now },
  // bitácora encadenada (ver services/ia/bitacora.js). Opcionales: las alertas
  // anteriores se encadenan con `npm run bitacora:encadenar`
  seq: { type: Number, default: null },
  hashAnterior: { type: String, default: null },
  hash: { type: String, default: null },
}, { _id: false });

// Se crea cuando Edumon detecta una posible situación de riesgo. Guarda solo
// el mensaje que la disparó, nunca la conversación completa (así lo promete el
// consentimiento). No tiene TTL: es registro de la ruta de atención.
const alertaRiesgoSchema = new mongoose.Schema({
  institucionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institucion',
    required: true,
  },
  // familia que escribió
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  perfilId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PerfilFamiliar',
    default: null,
  },
  // la conversación se borra a los 30 días; el id solo sirve para no duplicar alertas
  conversacionId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  categoria: {
    type: String,
    enum: CATEGORIAS_RIESGO,
    required: true,
  },
  mensajeDisparador: {
    type: String,
    required: true,
    trim: true,
    maxlength: 4000,
  },
  // a quién se notificó: el responsable de convivencia o, si no hay, el admin
  notificadoA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // automatica: caso grave detectado por Edumon; solicitada: la familia pidió que la contactaran
  origen: {
    type: String,
    enum: ['automatica', 'solicitada'],
    default: 'automatica',
  },
  // docentes de los cursos de esa familia: también reciben la alerta y pueden verla
  docentesCurso: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: [],
  },
  estado: {
    type: String,
    enum: ['nueva', 'en_atencion', 'cerrada'],
    default: 'nueva',
  },
  atendidaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  notas: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: '',
  },
  // por qué se generó (regla, IA o la familia la pidió); sobrevive al borrado de la conversación
  deteccion: {
    type: deteccionIASchema,
    default: null,
  },
  // línea de tiempo de la ruta de atención: nunca se reescribe, solo se agrega
  historial: {
    type: [historialSchema],
    default: [],
  },
  // primera vez que alguien la tomó y cuándo se cerró (para medir tiempos de respuesta)
  atendidaEn: { type: Date, default: null },
  cerradaEn: { type: Date, default: null },
}, { timestamps: true });

alertaRiesgoSchema.index({ institucionId: 1, estado: 1, createdAt: -1 });

export default mongoose.model('AlertaRiesgo', alertaRiesgoSchema);
