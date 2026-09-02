import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authMiddleware, requireRole } from '../../../src/middlewares/authMiddleware.js';
import { generarAccessToken, extractAccessToken } from '../../../src/controllers/authController.js';
import { crearPadre, crearDocente, crearAdministrador } from '../../helpers/factories.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('authMiddleware', () => {
  it('responde 401 si no hay token en cookie ni header', async () => {
    const req = { cookies: {}, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token requerido' });
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 403 si el token está mal firmado', async () => {
    const req = { cookies: { access_token: 'esto-no-es-un-jwt-valido' }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token inválido' });
  });

  it('responde 401 con code TOKEN_EXPIRED si el token ya venció', async () => {
    const padre = await crearPadre();
    const tokenExpirado = jwt.sign(
      { userId: padre._id, rol: padre.rol },
      process.env.JWT_SECRET,
      { expiresIn: -10 },
    );
    const req = { cookies: { access_token: tokenExpirado }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token expirado', code: 'TOKEN_EXPIRED' });
  });

  it('responde 401 si el usuario del token ya no existe', async () => {
    const idInexistente = '507f1f77bcf86cd799439011';
    const token = jwt.sign({ userId: idInexistente, rol: 'padre' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const req = { cookies: { access_token: token }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token inválido o usuario inactivo' });
  });

  it('responde 401 si el usuario está suspendido', async () => {
    const padre = await crearPadre({ estado: 'suspendido' });
    const token = generarAccessToken(padre);
    const req = { cookies: { access_token: token }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('con token válido, adjunta req.user con userId/rol/institucionId/perfilId/esTitular y llama next()', async () => {
    const docente = await crearDocente();
    const token = generarAccessToken(docente, { perfilId: null, esTitular: true });
    const req = { cookies: { access_token: token }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      userId: docente._id.toString(),
      rol: 'docente',
      institucionId: docente.institucionId ? docente.institucionId.toString() : null,
      perfilId: null,
      esTitular: true,
    });
  });

  it('propaga el perfilId/esTitular del token cuando el usuario tiene un perfil familiar activo', async () => {
    const padre = await crearPadre();
    const perfilId = '507f1f77bcf86cd799439099';
    const token = generarAccessToken(padre, { perfilId, esTitular: false });
    const req = { cookies: { access_token: token }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(req.user.perfilId).toBe(perfilId);
    expect(req.user.esTitular).toBe(false);
  });
});

describe('extractAccessToken', () => {
  it('prioriza la cookie access_token sobre el header Authorization', () => {
    const req = {
      cookies: { access_token: 'token-de-cookie' },
      headers: { authorization: 'Bearer token-de-header' },
    };
    expect(extractAccessToken(req)).toBe('token-de-cookie');
  });

  it('usa el header Authorization Bearer si no hay cookie', () => {
    const req = { cookies: {}, headers: { authorization: 'Bearer token-de-header' } };
    expect(extractAccessToken(req)).toBe('token-de-header');
  });

  it('devuelve null si no hay cookie ni header', () => {
    expect(extractAccessToken({ cookies: {}, headers: {} })).toBeNull();
  });
});

describe('requireRole', () => {
  it('responde 401 si no hay req.user', () => {
    const req = {};
    const res = mockRes();
    const next = vi.fn();

    requireRole(['administrador'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 403 si el rol del usuario no está permitido', () => {
    const req = { user: { rol: 'padre' } };
    const res = mockRes();
    const next = vi.fn();

    requireRole(['administrador', 'superadmin'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('llama a next() si el rol está permitido', () => {
    const req = { user: { rol: 'docente' } };
    const res = mockRes();
    const next = vi.fn();

    requireRole(['docente', 'administrador'])(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
