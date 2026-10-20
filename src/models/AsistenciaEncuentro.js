import mongoose from 'mongoose';

// Asistencia de una familia a un encuentro de escuela de padres (evento de
// categoría "escuela_padres"). La marca el docente del grupo o el admin. Es la
// evidencia de los encuentros que exige la Ley 2025 de 2020 (mínimo 3 al año):
// cada corrección queda en el historial con quién y cuándo.
const cambioSchema = new mongoose.Schema({
  asistio: { type: Boolean, required: true },
  modalidad: { type: String, enum: ['presencial', 'virtual'], default: 'presencial' },
  por: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  en: { type: Date, default: Date.now },
}, { _id: false });

const asistenciaEncuentroSchema = new mongoose.Schema({
  eventoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Evento', required: true },
  // grupo por el que se cuenta la participación de esa familia
  cursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curso', required: true },
  institucionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institucion', required: true },
  // familia (titular de la cuenta de padre)
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  asistio: { type: Boolean, required: true },
  modalidad: { type: String, enum: ['presencial', 'virtual'], default: 'presencial' },
  marcadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  marcadoEn: { type: Date, default: Date.now },
  historial: { type: [cambioSchema], default: [] },
}, { timestamps: true });

asistenciaEncuentroSchema.index({ eventoId: 1, usuarioId: 1 }, { unique: true });
asistenciaEncuentroSchema.index({ cursoId: 1, asistio: 1 });

export default mongoose.model('AsistenciaEncuentro', asistenciaEncuentroSchema);
