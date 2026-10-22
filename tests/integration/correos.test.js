import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crearApp, { claveLimiteGlobal } from '../../src/app.js';
import User from '../../src/models/User.js';
import { esCorreoValido, normalizarCorreo, formasDeCorreo } from '../../src/utils/correo.js';
import { crearPadre, crearInstitucion, crearAdministrador, crearCurso } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import { nodemailerSendMailMock } from '../setup/mocks.js';

describe('regla de correo', () => {
  it('no bloquea el servidor con textos largos que no son correo', () => {
    // con la expresión anterior, 40 letras sin dominio tardaban minutos
    const t = Date.now();
    for (const n of [40, 200, 5000]) expect(esCorreoValido(`${'a'.repeat(n)}@`)).toBe(false);
    expect(esCorreoValido(`${'a.'.repeat(3000)}@x`)).toBe(false);
    expect(Date.now() - t).toBeLessThan(200);
  });

  it('acepta correos reales que antes se rechazaban', () => {
    for (const c of ['maria.perez+colegio@gmail.com', 'ana-maria@uniautonoma.edu.co', 'jose_luis@hotmail.com', 'ñandú@correo.com']) {
      expect(esCorreoValido(c)).toBe(true);
    }
    for (const c of ['sin-arroba.com', 'a@b', 'a @b.co', 'a@b.c']) expect(esCorreoValido(c)).toBe(false);
  });

  it('normaliza espacios y mayúsculas sin quitar puntos', () => {
    expect(normalizarCorreo('  Maria.Perez@Gmail.com ')).toBe('maria.perez@gmail.com');
    expect(normalizarCorreo('   ')).toBeUndefined();
    expect(formasDeCorreo('Maria.Perez@Gmail.com')).toEqual(['maria.perez@gmail.com', 'mariaperez@gmail.com']);
  });
});

describe('guardar correos', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el propio perfil acepta un correo con espacio al final y lo guarda limpio', async () => {
    const padre = await crearPadre();
    const agente = await loginComo(app, padre);
    const res = await agente.put('/api/users/me/profile').send({ correo: 'Mama.Lopez@Gmail.com ' });
    expect(res.status).toBe(200);
    expect(res.body.user.correo).toBe('mama.lopez@gmail.com');
  });

  it('dos usuarios pueden quedar sin correo (vacío no choca con el índice único)', async () => {
    const a = await crearPadre();
    const b = await crearPadre();
    for (const u of [a, b]) {
      const res = await (await loginComo(app, u)).put('/api/users/me/profile').send({ correo: '' });
      expect(res.status).toBe(200);
    }
    expect(await User.countDocuments({ correo: { $exists: true } })).toBe(0);
  });

  it('correo repetido responde 409 con mensaje claro, no 500', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    const otro = await crearPadre({ correo: 'ocupado@correo.com' });
    const padre = await crearPadre();
    const curso = await crearCurso({ institucionId: institucion._id });
    curso.participantes.push({ usuarioId: padre._id, etiqueta: 'padre' });
    await curso.save();
    const agente = await loginComo(app, admin);
    const res = await agente.put(`/api/users/${padre._id}`).send({ correo: 'OCUPADO@correo.com' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/correo/);
    expect((await User.findById(otro._id)).correo).toBe('ocupado@correo.com');
  });

  it('correo inválido en el perfil responde 400, no 500', async () => {
    const padre = await crearPadre();
    const res = await (await loginComo(app, padre)).put('/api/users/me/profile').send({ correo: `${'a'.repeat(60)}@` });
    expect(res.status).toBe(400);
  });

  it('recuperar contraseña encuentra cuentas guardadas con la forma antigua del correo', async () => {
    await crearPadre({ correo: 'mariaperez@gmail.com' }); // como lo dejaba normalizeEmail()
    const res = await request(app).post('/api/auth/forgot-password').send({ correo: 'Maria.Perez@gmail.com ' });
    expect(res.status).toBe(200);
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
  });
});

describe('límite global de solicitudes', () => {
  it('cuenta por usuario con sesión, no por la IP compartida del colegio', () => {
    const token = jwt.sign({ userId: 'abc' }, process.env.JWT_SECRET);
    expect(claveLimiteGlobal({ ip: '10.0.0.1', headers: {}, cookies: { access_token: token } })).toBe('usuario:abc');
    expect(claveLimiteGlobal({ ip: '10.0.0.1', headers: {}, cookies: { access_token: jwt.sign({ userId: 'x' }, 'otra') } })).toBe('ip:10.0.0.1');
  });
});
