import { describe, it, expect, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import Tarea from '../../../src/models/Tarea.js';
import Evento from '../../../src/models/Evento.js';
import Curso from '../../../src/models/Curso.js';

// Etapas del plan ganador de explain(), aplanadas
const etapas = (plan) => {
  const out = [];
  const visitar = (n) => {
    if (!n) return;
    out.push(n.stage);
    visitar(n.inputStage);
    (n.inputStages ?? []).forEach(visitar);
  };
  visitar(plan.queryPlanner.winningPlan.queryPlan ?? plan.queryPlanner.winningPlan);
  return out;
};

describe('índices de consultas frecuentes', () => {
  beforeAll(async () => {
    await Promise.all([Tarea.syncIndexes(), Evento.syncIndexes(), Curso.syncIndexes()]);
  });

  const id = () => new mongoose.Types.ObjectId();

  it('retos de un curso ordenados por fecha: usan índice, sin ordenar en memoria', async () => {
    const plan = await Tarea.find({ cursoId: id() }).sort({ fechaEntrega: 1 }).explain();
    expect(etapas(plan)).toContain('IXSCAN');
    expect(etapas(plan)).not.toContain('SORT');
  });

  it('eventos de un curso ordenados por inicio: usan índice, sin ordenar en memoria', async () => {
    const plan = await Evento.find({ cursosIds: id() }).sort({ fechaInicio: 1 }).explain();
    expect(etapas(plan)).toContain('IXSCAN');
    expect(etapas(plan)).not.toContain('SORT');
  });

  it('cursos de una institución por estado y fecha: usan índice, sin ordenar en memoria', async () => {
    const plan = await Curso.find({ institucionId: id(), estado: { $in: ['activo', 'archivado'] } })
      .sort({ fechaCreacion: -1 })
      .explain();
    expect(etapas(plan)).toContain('IXSCAN');
    expect(etapas(plan)).not.toContain('SORT');
  });
});
