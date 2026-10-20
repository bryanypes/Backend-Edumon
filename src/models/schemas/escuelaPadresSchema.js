import mongoose from 'mongoose';
import { EJES_CRIANZA } from '../../config/edumonIA.js';

// Tema de escuela de padres (Decreto 459) que el docente le asigna a un reto o
// evento para que Edumon lo recomiende en el chat a las familias que preguntan
// por lo mismo. null = Edumon no lo recomienda.
const escuelaPadresSchema = new mongoose.Schema({
  eje: { type: String, enum: EJES_CRIANZA, required: true },
  subtema: { type: String, trim: true, default: null },
  tema: { type: String, trim: true, maxlength: 150, default: null },
}, { _id: false });

export default escuelaPadresSchema;
