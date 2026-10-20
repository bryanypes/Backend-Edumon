import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import UsoIA from '../../src/models/UsoIA.js';
import { completar, _reiniciarEstadoIA } from '../../src/services/ia/proveedorIA.js';
import { resumenCostos, cargarPrecios } from '../../src/services/ia/costosIA.js';
import { crearAdministrador, crearDocente, crearInstitucion, crearCurso, crearPadre } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import { stubProveedores, configurarLlaves, guardarEntorno } from '../helpers/proveedoresFalsos.js';

const conUso = (datos, entrada, salida) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(datos) } }],
  usage: { prompt_tokens: entrada, completion_tokens: salida },
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Costo de la IA', () => {
  let restaurar;
  beforeEach(() => { restaurar = guardarEntorno(); _reiniciarEstadoIA(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { restaurar(); vi.restoreAllMocks(); });

  it('la tabla de precios viene de páginas oficiales, con fuente y fecha', () => {
    const { modelos } = cargarPrecios();
    for (const m of modelos) {
      expect(m.fuente).toMatch(/^https:\/\/(console\.groq\.com|platform\.openai\.com)\//);
      expect(m.consultado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(modelos.find((m) => m.modelo === 'openai/gpt-oss-120b')).toMatchObject({ entradaUSDPorMillon: 0.15, salidaUSDPorMillon: 0.6 });
    expect(modelos.find((m) => m.modelo === 'gpt-4.1-mini')).toMatchObject({ entradaUSDPorMillon: 0.4, salidaUSDPorMillon: 1.6 });
  });

  it('cada llamada exitosa registra proveedor, modelo, operación y tokens reales', async () => {
    configurarLlaves({ openai: false });
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
    stubProveedores({ groq: () => conUso({ ok: true }, 1200, 300) });
    const r = await completar({ system: 's', messages: [], schema: { type: 'object' }, nombre: 'clasificacion_edumon' });
    expect(r.uso).toEqual({ tokensEntrada: 1200, tokensSalida: 300 });
    const fila = await UsoIA.findOne().lean();
    expect(fila).toMatchObject({ proveedor: 'groq', modelo: 'openai/gpt-oss-120b', operacion: 'clasificacion_edumon', tokensEntrada: 1200, tokensSalida: 300 });
  });

  it('calcula costo acumulado, por mensaje y proyección mensual con los precios de la tabla', async () => {
    await UsoIA.insertMany([
      // 2 mensajes de chat en Groq: clasificación + respuesta
      { proveedor: 'groq', modelo: 'openai/gpt-oss-120b', operacion: 'clasificacion_edumon', tokensEntrada: 2000, tokensSalida: 200 },
      { proveedor: 'groq', modelo: 'openai/gpt-oss-120b', operacion: 'respuesta_edumon', tokensEntrada: 3000, tokensSalida: 500 },
      { proveedor: 'groq', modelo: 'openai/gpt-oss-120b', operacion: 'clasificacion_edumon', tokensEntrada: 2000, tokensSalida: 200 },
      // un modelo sin precio en la tabla: no se inventa
      { proveedor: 'groq', modelo: 'modelo-desconocido', operacion: 'reto_escuela_padres', tokensEntrada: 100, tokensSalida: 100 },
    ]);
    const r = await resumenCostos({ familias: 200, mensajesPorFamiliaMes: 10 });
    // (7000 × 0.15 + 900 × 0.60) / 1e6 = 0.00159
    expect(r.costoAcumuladoUSD).toBeCloseTo(0.00159, 8);
    expect(r.hayModelosSinPrecio).toBe(true);
    expect(r.porModelo['groq/modelo-desconocido'].costoUSD).toBeNull();
    expect(r.chat).toMatchObject({ mensajes: 2 });
    expect(r.chat.costoPorMensajeUSD).toBeCloseTo(0.00159 / 2, 8);
    expect(r.proyeccionMensual).toMatchObject({ familias: 200, mensajesPorFamiliaMes: 10, mensajesMes: 2000 });
    expect(r.proyeccionMensual.costoUSD).toBeCloseTo((0.00159 / 2) * 2000, 4);
  });

  describe('GET /api/ia/costos', () => {
    let app;
    beforeEach(() => { ({ app } = crearApp()); });

    it('el administrador ve el costo; por defecto proyecta con las familias de su institución', async () => {
      const inst = await crearInstitucion();
      const padres = await Promise.all([1, 2, 3].map(() => crearPadre()));
      await crearCurso({ institucionId: inst._id, participantes: padres.map((p) => ({ usuarioId: p._id, etiqueta: 'padre' })) });
      await UsoIA.create({ proveedor: 'groq', modelo: 'openai/gpt-oss-120b', operacion: 'clasificacion_edumon', tokensEntrada: 1000, tokensSalida: 100 });
      const agent = await loginComo(app, await crearAdministrador({ institucionId: inst._id }));

      const res = await agent.get('/api/ia/costos');
      expect(res.status).toBe(200);
      expect(res.body.proyeccionMensual).toMatchObject({ familias: 3, mensajesPorFamiliaMes: 10, mensajesMes: 30 });
      expect(res.body.tablaDePrecios.modelos.length).toBeGreaterThan(0);
      expect((await agent.get('/api/ia/costos?familias=500&mensajesPorFamiliaMes=4')).body.proyeccionMensual.mensajesMes).toBe(2000);
      expect((await agent.get('/api/ia/costos?familias=-1')).status).toBe(400);
    });

    it('solo administrador', async () => {
      expect((await (await loginComo(app, await crearDocente())).get('/api/ia/costos')).status).toBe(403);
      expect((await request(app).get('/api/ia/costos')).status).toBe(401);
    });
  });
});
