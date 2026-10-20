import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import ConversacionIA from '../../../src/models/ConversacionIA.js';
import FichaCrianza from '../../../src/models/FichaCrianza.js';
import AlertaRiesgo from '../../../src/models/AlertaRiesgo.js';
import { DIAS_RETENCION_CONVERSACIONES } from '../../../src/config/edumonIA.js';

const id = () => new mongoose.Types.ObjectId();

const fichaValida = (overrides = {}) => ({
  titulo: 'Rabietas en la primera infancia',
  eje: 'crianza_amorosa',
  subtema: 'Rabietas',
  edadMin: 2,
  edadMax: 6,
  contenido: 'Las rabietas son una forma normal de expresar frustración.',
  practica: 'Nombra la emoción de tu hijo en voz alta antes de poner el límite.',
  fuente: { nombre: 'UNICEF' },
  ...overrides,
});

describe('ConversacionIA', () => {
  it('tiene un índice TTL de 30 días sobre ultimaActividad', () => {
    const ttl = ConversacionIA.schema.indexes()
      .find(([campos, opciones]) => campos.ultimaActividad === 1 && opciones.expireAfterSeconds);
    expect(ttl[1].expireAfterSeconds).toBe(DIAS_RETENCION_CONVERSACIONES * 24 * 60 * 60);
  });

  it('perteneceA distingue al titular de sus perfiles familiares', () => {
    const usuarioId = id();
    const perfilId = id();
    const delTitular = new ConversacionIA({ usuarioId });
    const delPerfil = new ConversacionIA({ usuarioId, perfilId });

    expect(delTitular.perteneceA(usuarioId, null)).toBe(true);
    expect(delTitular.perteneceA(usuarioId, perfilId)).toBe(false);
    expect(delPerfil.perteneceA(usuarioId, perfilId)).toBe(true);
    expect(delPerfil.perteneceA(id(), perfilId)).toBe(false);
  });

  it('rechaza un rol de mensaje desconocido', async () => {
    const conversacion = new ConversacionIA({ usuarioId: id(), mensajes: [{ rol: 'docente', contenido: 'hola' }] });
    await expect(conversacion.validate()).rejects.toThrow();
  });
});

describe('FichaCrianza', () => {
  it('acepta una ficha válida y normaliza el subtema a minúsculas', async () => {
    const ficha = new FichaCrianza(fichaValida());
    await expect(ficha.validate()).resolves.toBeUndefined();
    expect(ficha.subtema).toBe('rabietas');
  });

  it('rechaza un eje que no está en el Decreto 459', async () => {
    await expect(new FichaCrianza(fichaValida({ eje: 'deportes' })).validate()).rejects.toThrow();
  });

  it('rechaza edadMax menor que edadMin', async () => {
    await expect(new FichaCrianza(fichaValida({ edadMin: 10, edadMax: 5 })).validate()).rejects.toThrow();
  });

  it('exige la fuente', async () => {
    await expect(new FichaCrianza(fichaValida({ fuente: undefined })).validate()).rejects.toThrow();
  });
});

describe('AlertaRiesgo', () => {
  it('arranca en estado nueva', async () => {
    const alerta = new AlertaRiesgo({
      institucionId: id(),
      usuarioId: id(),
      categoria: 'maltrato_fisico',
      mensajeDisparador: 'mensaje',
    });
    await expect(alerta.validate()).resolves.toBeUndefined();
    expect(alerta.estado).toBe('nueva');
  });

  it('rechaza una categoría desconocida', async () => {
    const alerta = new AlertaRiesgo({
      institucionId: id(),
      usuarioId: id(),
      categoria: 'otra',
      mensajeDisparador: 'mensaje',
    });
    await expect(alerta.validate()).rejects.toThrow();
  });
});
