import mongoose from 'mongoose';

// Por qué Edumon clasificó un mensaje como lo hizo. Se guarda en el mensaje del
// cuidador y se copia a la alerta (la conversación se borra a los 30 días; la
// alerta no), para poder explicar y auditar cada aviso.
const hallazgoSchema = new mongoose.Schema({
  categoria: String,
  gravedad: { type: String, enum: ['moderado', 'grave'] },
  // fragmento del mensaje que activó la regla
  patron: { type: String, maxlength: 120 },
}, { _id: false });

const deteccionIASchema = new mongoose.Schema({
  // 'ia' = LLM + reglas; 'reglas' = sin LLM (no configurado o falló)
  fuente: { type: String, enum: ['ia', 'reglas'], required: true },
  modelo: { type: String, default: null },
  reglaSegura: { type: hallazgoSchema, default: null },
  // indicio que solo cuenta si el LLM lo confirma
  reglaDudosa: { type: hallazgoSchema, default: null },
  // lo que respondió el LLM, tal cual
  llm: {
    type: new mongoose.Schema({ nivelRiesgo: String, gravedad: String, categoria: String }, { _id: false }),
    default: null,
  },
  // quién determinó el riesgo final: la regla, la regla confirmada por la IA o la IA sola
  decidio: { type: String, enum: ['regla', 'regla_confirmada_por_ia', 'ia', null], default: null },
  // si el LLM falló y se usaron solo reglas
  errorIA: { type: String, default: null },
  // proveedor que clasificó, latencia y si antes falló otro (opcionales: los
  // documentos anteriores siguen siendo válidos)
  proveedor: { type: String, default: null },
  latenciaMs: { type: Number, default: null },
  huboFallback: { type: Boolean, default: false },
  proveedoresFallidos: { type: [String], default: undefined },
  desdeCache: { type: Boolean, default: false },
}, { _id: false });

export default deteccionIASchema;
