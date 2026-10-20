import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import Institucion from '../../src/models/Institucion.js';
import AlertaRiesgo from '../../src/models/AlertaRiesgo.js';
import ConversacionIA from '../../src/models/ConversacionIA.js';
import { sembrarDemo, CLAVE_DEMO, NIT_DEMO } from '../../src/scripts/seedDemo.js';
import { crearPadre, crearInstitucion } from '../helpers/factories.js';

const silencio = () => {};

// cada prueba siembra la demo completa (decenas de mensajes por el flujo real): margen amplio para CI
const LENTO = 60000;

describe('seed de demo (npm run seed:demo)', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
    vi.spyOn(console, 'log').mockImplementation(silencio);
  }, LENTO);

  it('crea 1 colegio, 3 cursos con ≥6 familias, una alerta de cada tipo y un ciclo listo', async () => {
    const r = await sembrarDemo({ log: silencio });

    expect(r.cursos).toHaveLength(3);
    for (const c of r.cursos) expect(c.familias).toBeGreaterThanOrEqual(6);
    expect(r.alertas).toMatchObject({
      tipoI: { ambito: 'escolar', tipoLey1620: 'I' },
      tipoII: { ambito: 'escolar', tipoLey1620: 'II' },
      tipoIII: { ambito: 'escolar', tipoLey1620: 'III' },
      hogar: { ambito: 'hogar', tipoLey1620: null },
      personal: { ambito: 'personal', tipoLey1620: null },
    });

    // ciclo listo en Grado Quinto A: pantallas (6 familias) y sueño (5)
    const docente = await User.findOne({ telefono: '+573009990003' });
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ telefono: docente.telefono, contraseña: CLAVE_DEMO });
    expect(login.status).toBe(200);
    const ciclo = await agent.get(`/api/ia/cursos/${r.cursos[0].cursoId}/ciclo`);
    expect(ciclo.body.temas.map((t) => [t.subtema, t.familias])).toEqual([['pantallas', 6], ['sueno', 5]]);
    expect(ciclo.body.temas[0].retosCreados).toHaveLength(1);

    // Noveno: adolescentes visible, consumo (2 familias) oculto
    const noveno = await User.findOne({ telefono: '+573009990005' });
    const agentN = request.agent(app);
    await agentN.post('/api/auth/login').send({ telefono: noveno.telefono, contraseña: CLAVE_DEMO });
    const cicloN = await agentN.get(`/api/ia/cursos/${r.cursos[2].cursoId}/ciclo`);
    expect(cicloN.body.temas.map((t) => t.subtema)).toEqual(['comunicacion_adolescentes']);
    expect(cicloN.body.hayTemasOcultos).toBe(true);

    // la bitácora de todas las alertas de demo es íntegra
    const rectora = await User.findOne({ telefono: '+573009990001' });
    const agentR = request.agent(app);
    await agentR.post('/api/auth/login').send({ telefono: rectora.telefono, contraseña: CLAVE_DEMO });
    const integridad = await agentR.get('/api/ia/alertas/integridad');
    expect(integridad.body).toMatchObject({ valida: true, alertas: 5 });
  }, LENTO);

  it('es idempotente y no toca datos que no son de demo', async () => {
    const ajena = await crearInstitucion();
    const padreReal = await crearPadre();

    const primera = await sembrarDemo({ log: silencio });
    const conteo = async () => ({
      usuarios: await User.countDocuments(),
      alertas: await AlertaRiesgo.countDocuments(),
      conversaciones: await ConversacionIA.countDocuments(),
      demo: await Institucion.countDocuments({ nit: NIT_DEMO }),
    });
    const antes = await conteo();
    const segunda = await sembrarDemo({ log: silencio });
    const despues = await conteo();

    expect(despues).toEqual(antes);
    expect(despues.demo).toBe(1);
    expect(segunda.cursos.map((c) => c.nombre)).toEqual(primera.cursos.map((c) => c.nombre));
    expect(await Institucion.findById(ajena._id)).not.toBeNull();
    expect(await User.findById(padreReal._id)).not.toBeNull();
  }, LENTO);

  it('se niega a correr con NODE_ENV=production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(sembrarDemo({ log: silencio })).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = original;
    }
  }, LENTO);
});
