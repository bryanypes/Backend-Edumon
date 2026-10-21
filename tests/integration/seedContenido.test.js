import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Entrega from '../../src/models/Entrega.js';
import Tarea from '../../src/models/Tarea.js';
import Foro from '../../src/models/Foro.js';
import MensajeForo from '../../src/models/MensajeForo.js';
import Evento from '../../src/models/Evento.js';
import AsistenciaEncuentro from '../../src/models/AsistenciaEncuentro.js';
import PerfilFamiliar from '../../src/models/PerfilFamiliar.js';
import Curso from '../../src/models/Curso.js';
import { UPLOAD_DIR } from '../../src/config/almacenamiento.js';
import { sembrarDemo } from '../../src/scripts/seedDemo.js';
import { sembrarContenido } from '../../src/scripts/seedContenido.js';

const silencio = () => {};
const LENTO = 90000;

const conteo = async () => ({
  retos: await Tarea.countDocuments(),
  entregas: await Entrega.countDocuments(),
  foros: await Foro.countDocuments(),
  mensajes: await MensajeForo.countDocuments(),
  eventos: await Evento.countDocuments(),
  asistencias: await AsistenciaEncuentro.countDocuments(),
  perfiles: await PerfilFamiliar.countDocuments(),
});

describe('seed de contenido (npm run seed:contenido)', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(silencio);
    await sembrarDemo({ log: silencio });
  }, LENTO);

  it('llena retos, entregas con fotos y calificación, foros, eventos con asistencia y perfiles', async () => {
    const r = await sembrarContenido({ log: silencio });
    expect(r.retos).toBeGreaterThanOrEqual(10);
    expect(r.entregas).toBeGreaterThanOrEqual(40);
    expect(r.imagenes).toBeGreaterThanOrEqual(30);

    const conFoto = await Entrega.findOne({ 'archivosAdjuntos.0': { $exists: true } }).lean();
    const adjunto = conFoto.archivosAdjuntos[0];
    expect(adjunto.privado).toBe(true);
    expect(fs.existsSync(path.join(UPLOAD_DIR, adjunto.publicId))).toBe(true);

    expect(await Entrega.countDocuments({ 'calificacion.valoracion': { $gte: 1 } })).toBeGreaterThan(20);
    expect(await Entrega.countDocuments({ estado: 'tarde' })).toBeGreaterThan(0);
    expect(await MensajeForo.countDocuments({ respuestaA: { $ne: null } })).toBeGreaterThan(0);
    expect(await AsistenciaEncuentro.countDocuments({ asistio: true })).toBeGreaterThan(0);
    expect(await Evento.countDocuments({ estado: 'finalizado' })).toBeGreaterThan(0);
    expect(await Curso.countDocuments({ fotoPortadaUrl: { $ne: null } })).toBe(3);
  }, LENTO);

  it('es idempotente: la segunda vez deja los mismos datos y no acumula archivos', async () => {
    await sembrarContenido({ log: silencio });
    const antes = await conteo();
    const archivosAntes = fs.readdirSync(path.join(UPLOAD_DIR, 'priv', 'archivos-entregas')).length;
    await sembrarContenido({ log: silencio });
    expect(await conteo()).toEqual(antes);
    expect(fs.readdirSync(path.join(UPLOAD_DIR, 'priv', 'archivos-entregas')).length).toBe(archivosAntes);
  }, LENTO);

  it('el seed de demo base borra también el contenido', async () => {
    await sembrarContenido({ log: silencio });
    await sembrarDemo({ log: silencio });
    expect(await Entrega.countDocuments()).toBe(0);
    expect(await Foro.countDocuments()).toBe(0);
    expect(await PerfilFamiliar.countDocuments()).toBe(0);
  }, LENTO);

  it('se niega a correr con NODE_ENV=production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(sembrarContenido({ log: silencio })).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = original;
    }
  }, LENTO);
});
