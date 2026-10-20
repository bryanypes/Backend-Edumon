import mongoose from 'mongoose';
import { NIVELES_RIESGO, DIAS_RETENCION_CONVERSACIONES } from '../config/edumonIA.js';
import deteccionIASchema from './schemas/deteccionIASchema.js';

const mensajeSchema = new mongoose.Schema({
  rol: {
    type: String,
    enum: ['usuario', 'edumon'],
    required: true,
  },
  contenido: {
    type: String,
    required: true,
    trim: true,
    maxlength: 4000,
  },
  // fichas curadas en las que se basó la respuesta (solo mensajes de edumon)
  fichasIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FichaCrianza' }],
    default: [],
  },
  // práctica de 5 minutos y fuentes, separadas para que el front las destaque
  practica: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  },
  fuentes: {
    type: [{
      _id: false,
      nombre: { type: String, trim: true },
      url: { type: String, trim: true, default: null },
    }],
    default: [],
  },
  // videos y artículos para profundizar (enlaces validados o búsquedas armadas por el backend)
  recursos: {
    type: [{
      _id: false,
      tipo: { type: String, enum: ['video', 'articulo'] },
      titulo: String,
      url: String,
      esBusqueda: Boolean,
    }],
    default: [],
  },
  // la respuesta es la plantilla fija de riesgo (no la escribió la IA)
  esRespuestaRiesgo: {
    type: Boolean,
    default: false,
  },
  // qué clase de respuesta dio Edumon: el front elige la expresión de la mascota
  tipo: {
    type: String,
    enum: ['respuesta', 'pedir_edad', 'fuera_alcance', 'no_tareas', 'apoyo', 'riesgo', 'charla', null],
    default: null,
  },
  // nivel 2: Edumon ofrece que orientación y el docente contacten a la familia
  ofrecerAyuda: {
    type: new mongoose.Schema({
      categoria: String,
      solicitada: { type: Boolean, default: false },
    }, { _id: false }),
    default: null,
  },
  // la respuesta lleva la nota de apoyo al cuidador (nivel "atención")
  atencion: {
    type: Boolean,
    default: false,
  },
  // reto de escuela de padres abierto sobre el mismo tema, para invitar a la familia
  retoSugerido: {
    type: new mongoose.Schema({
      tareaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tarea' },
      titulo: String,
      fechaEntrega: Date,
    }, { _id: false }),
    default: null,
  },
  // evento que el docente marcó para que Edumon lo recomiende sobre este tema
  eventoSugerido: {
    type: new mongoose.Schema({
      eventoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Evento' },
      titulo: String,
      fechaInicio: Date,
      hora: String,
      ubicacion: String,
    }, { _id: false }),
    default: null,
  },
  // clasificación del mensaje del usuario
  nivelRiesgo: {
    type: String,
    enum: NIVELES_RIESGO,
    default: null,
  },
  // por qué se clasificó así (solo mensajes del usuario)
  deteccion: {
    type: deteccionIASchema,
    default: null,
  },
  creadoEn: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

// Privada: solo el dueño (usuarioId + perfilId) puede leerla. Ni docentes ni
// administradores tienen endpoint para verla.
const conversacionIASchema = new mongoose.Schema({
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
  institucionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institucion',
    default: null,
  },
  titulo: {
    type: String,
    trim: true,
    maxlength: 100,
    default: 'Nueva conversación',
  },
  // no hay entidad estudiante: Edumon pregunta la edad y la guarda solo aquí
  edadHijo: {
    type: Number,
    min: 0,
    max: 25,
    default: null,
  },
  mensajes: {
    type: [mensajeSchema],
    default: [],
  },
  ultimaActividad: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

conversacionIASchema.index({ usuarioId: 1, perfilId: 1, ultimaActividad: -1 });
conversacionIASchema.index(
  { ultimaActividad: 1 },
  { expireAfterSeconds: DIAS_RETENCION_CONVERSACIONES * 24 * 60 * 60 },
);

conversacionIASchema.methods.perteneceA = function (usuarioId, perfilId) {
  return this.usuarioId.toString() === usuarioId.toString()
    && String(this.perfilId || '') === String(perfilId || '');
};

export default mongoose.model('ConversacionIA', conversacionIASchema);
