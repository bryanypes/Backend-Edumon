import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crearApp from '../../src/app.js';
import { guardarResultado, resumenMetricas, leerResultados } from '../../src/services/ia/metricasIA.js';
import { crearAdministrador, crearDocente, crearPadre, crearSuperadmin, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const corrida = (fecha, conjunto, modo, recall) => ({
  fecha, version: '1.0.0+abc1234', conjunto, modo, proveedor: modo === 'llm' ? 'openai' : null, modelo: null,
  metricas: { casos: 10, recallGraves: recall, tasaFalsasAlarmas: 0.1, riesgoExacto: 0.8, precisionTema: 0.9, precisionPorTema: { sueno: { ok: 1, total: 1, precision: 1 } }, gravesPerdidos: [{ texto: 'x' }], falsasAlarmas: [] },
});

describe('Métricas de seguridad de la IA', () => {
  let dir;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edumon-metricas-')); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('guarda una corrida por archivo y devuelve la última de cada conjunto/modo sin alterar los números', async () => {
    await guardarResultado(corrida('2026-10-19T10:00:00.000Z', 'holdout', 'simulado', 0.05), dir);
    await guardarResultado(corrida('2026-10-20T10:00:00.000Z', 'holdout', 'simulado', 0.5), dir);
    await guardarResultado(corrida('2026-10-20T10:00:00.000Z', 'original', 'simulado', 0.879), dir);
    await fs.writeFile(path.join(dir, 'dañado.json'), '{ no es json');

    expect(await leerResultados(dir)).toHaveLength(3);
    const r = await resumenMetricas(dir);
    const holdout = r.ultimas.find((u) => u.conjunto === 'holdout');
    expect(holdout).toMatchObject({ fecha: '2026-10-20T10:00:00.000Z', recallGraves: 0.5, tasaFalsasAlarmas: 0.1, gravesPerdidos: [{ texto: 'x' }] });
    expect(r.ultimas.find((u) => u.conjunto === 'original').recallGraves).toBe(0.879);
    expect(r.historial.map((h) => h.recallGraves)).toEqual(expect.arrayContaining([0.05, 0.5, 0.879]));
  });

  it('sin carpeta de resultados responde vacío', async () => {
    expect(await resumenMetricas(path.join(dir, 'no-existe'))).toMatchObject({ ultimas: [], historial: [] });
  });

  describe('GET /api/ia/metricas', () => {
    let app;
    beforeEach(() => { ({ app } = crearApp()); });

    it('el administrador ve las corridas guardadas en el repositorio', async () => {
      const institucion = await crearInstitucion();
      const agent = await loginComo(app, await crearAdministrador({ institucionId: institucion._id }));
      const res = await agent.get('/api/ia/metricas');
      expect(res.status).toBe(200);
      expect(res.body.nota).toMatch(/sin ajustar/);
      expect(res.body.ultimas.map((u) => u.conjunto)).toEqual(expect.arrayContaining(['holdout', 'original']));
      for (const u of res.body.ultimas) {
        expect(u).toHaveProperty('recallGraves');
        expect(u).toHaveProperty('tasaFalsasAlarmas');
        expect(u).toHaveProperty('precisionPorTema');
        expect(Array.isArray(u.gravesPerdidos)).toBe(true);
      }
    });

    it.each([['docente', crearDocente], ['padre', crearPadre], ['superadmin', crearSuperadmin]])('%s: 403', async (_, crear) => {
      expect((await (await loginComo(app, await crear())).get('/api/ia/metricas')).status).toBe(403);
    });

    it('sin sesión: 401', async () => {
      expect((await request(app).get('/api/ia/metricas')).status).toBe(401);
    });
  });
});
