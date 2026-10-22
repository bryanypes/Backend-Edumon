import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import { crearPadre, crearDocente, crearAdministrador, crearInstitucion, CONTRASEÑA_PRUEBA } from '../helpers/factories.js';

const DIA = 24 * 60 * 60;
const maxAgeRefresh = (res) => Number(res.headers['set-cookie'].find((c) => c.startsWith('refresh_token=')).match(/Max-Age=(\d+)/)[1]);

describe('duración de la sesión', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  const login = (u) => request(app).post('/api/auth/login').send({ telefono: u.telefono, contraseña: CONTRASEÑA_PRUEBA });

  it('padres y docentes quedan con sesión de un año', async () => {
    for (const u of [await crearPadre(), await crearDocente({ institucionId: (await crearInstitucion())._id })]) {
      const res = await login(u);
      expect(res.status).toBe(200);
      expect(maxAgeRefresh(res)).toBeGreaterThan(364 * DIA);
    }
  });

  it('administradores siguen con 7 días', async () => {
    const admin = await crearAdministrador({ institucionId: (await crearInstitucion())._id });
    expect(maxAgeRefresh(await login(admin))).toBeLessThanOrEqual(7 * DIA);
  });

  it('cada renovación vuelve a extender la sesión desde ese momento', async () => {
    const padre = await crearPadre();
    const agente = request.agent(app);
    await agente.post('/api/auth/login').send({ telefono: padre.telefono, contraseña: CONTRASEÑA_PRUEBA });
    const antes = (await User.findById(padre._id).select('+refreshTokens')).refreshTokens[0].expiraEn;
    const res = await agente.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    const despues = (await User.findById(padre._id).select('+refreshTokens')).refreshTokens.at(-1).expiraEn;
    expect(despues.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    expect(despues.getTime() - Date.now()).toBeGreaterThan(364 * DIA * 1000);
  });
});
