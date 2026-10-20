import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crearApp, { valorTrustProxy, claveLimiteGlobal } from '../../src/app.js';
import { crearPadre, CONTRASEÑA_PRUEBA } from '../helpers/factories.js';

// Despliegue en Render detrás del rewrite de Vercel (ver DEPLOY.md)

describe('GET /health', () => {
  it('responde sin tocar la base de datos ni pedir sesión', async () => {
    const { app } = crearApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('TRUST_PROXY', () => {
  it('por defecto confía en un salto y acepta números, false o una lista', () => {
    expect(valorTrustProxy(undefined)).toBe(1);
    expect(valorTrustProxy('2')).toBe(2);
    expect(valorTrustProxy('false')).toBe(false);
    expect(valorTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });
});

describe('clave del límite global', () => {
  const req = (extra = {}) => ({ ip: '76.76.21.21', headers: {}, cookies: {}, ...extra });

  it('con un token válido limita por usuario, no por la IP del proxy', () => {
    const token = jwt.sign({ userId: 'abc123' }, process.env.JWT_SECRET);
    expect(claveLimiteGlobal(req({ cookies: { access_token: token } }))).toBe('usuario:abc123');
    expect(claveLimiteGlobal(req({ headers: { authorization: `Bearer ${token}` } }))).toBe('usuario:abc123');
  });

  it('sin sesión o con un token falsificado limita por IP', () => {
    const falso = jwt.sign({ userId: 'otro' }, 'secreto-equivocado');
    expect(claveLimiteGlobal(req())).toBe('ip:76.76.21.21');
    expect(claveLimiteGlobal(req({ cookies: { access_token: falso } }))).toBe('ip:76.76.21.21');
  });
});

describe('cookies de sesión', () => {
  it('salen con SameSite=Lax (la web llama a /api en su mismo dominio)', async () => {
    const { app } = crearApp();
    const padre = await crearPadre();
    const res = await request(app).post('/api/auth/login').send({ telefono: padre.telefono, contraseña: CONTRASEÑA_PRUEBA });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies.find((c) => c.startsWith('access_token='))).toMatch(/SameSite=Lax/i);
    expect(cookies.find((c) => c.startsWith('refresh_token='))).toMatch(/SameSite=Lax/i);
  });
});
