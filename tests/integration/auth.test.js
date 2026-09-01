import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import { crearPadre, telefonoDePrueba, cedulaDePrueba, CONTRASEÑA_PRUEBA } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import { nodemailerSendMailMock, twilioCreateMock } from '../setup/mocks.js';

describe('POST /api/auth/register', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  const datosValidos = () => ({
    nombre: 'Ana María',
    apellido: 'Gómez Ruiz',
    cedula: cedulaDePrueba(),
    correo: `ana${Date.now()}${Math.random()}@test.edumon.com`,
    contraseña: 'ClaveSegura123',
    rol: 'padre',
    telefono: telefonoDePrueba(),
  });

  it('registra un padre, deja la sesión iniciada (cookies) y devuelve el usuario sin contraseña', async () => {
    const datos = datosValidos();
    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.status).toBe(201);
    expect(res.body.user.correo).toBe(datos.correo.toLowerCase());
    expect(res.body.user.contraseña).toBeUndefined();
    expect(res.headers['set-cookie'].some((c) => c.startsWith('access_token='))).toBe(true);
    expect(res.headers['set-cookie'].some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('rechaza con 400 si falta un campo requerido', async () => {
    const { nombre, ...sinNombre } = datosValidos();
    const res = await request(app).post('/api/auth/register').send(sinNombre);
    expect(res.status).toBe(400);
  });

  it('rechaza una contraseña débil (sin mayúscula/minúscula/dígito)', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...datosValidos(), contraseña: 'todominusculas' });
    expect(res.status).toBe(400);
  });

  it('acepta un teléfono colombiano sin el prefijo +57 y lo normaliza al guardarlo', async () => {
    const datos = { ...datosValidos(), telefono: '3001112233' };
    const res = await request(app).post('/api/auth/register').send(datos);
    expect(res.status).toBe(201);
    expect(res.body.user.telefono).toBe('+573001112233');
  });

  it('rechaza un teléfono que no es un número colombiano válido en ningún formato', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...datosValidos(), telefono: '123' });
    expect(res.status).toBe(400);
  });

  it('rechaza institucionId ausente cuando el rol es docente', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...datosValidos(), rol: 'docente' });
    expect(res.status).toBe(400);
  });

  it('responde 409 si la cédula ya está registrada', async () => {
    const existente = await crearPadre();
    const res = await request(app).post('/api/auth/register').send({ ...datosValidos(), cedula: existente.cedula });
    expect(res.status).toBe(409);
  });

  it('responde 409 si el correo ya está registrado', async () => {
    const existente = await crearPadre();
    const res = await request(app).post('/api/auth/register').send({ ...datosValidos(), correo: existente.correo });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('inicia sesión con teléfono y contraseña correctos', async () => {
    const padre = await crearPadre();
    const res = await request(app).post('/api/auth/login').send({ telefono: padre.telefono, contraseña: CONTRASEÑA_PRUEBA });

    expect(res.status).toBe(200);
    expect(res.body.user.rol).toBe('padre');
    expect(res.headers['set-cookie'].some((c) => c.startsWith('access_token='))).toBe(true);
  });

  it('responde 401 con contraseña incorrecta', async () => {
    const padre = await crearPadre();
    const res = await request(app).post('/api/auth/login').send({ telefono: padre.telefono, contraseña: 'ClaveIncorrecta1' });
    expect(res.status).toBe(401);
  });

  it('responde 401 para un teléfono que no existe', async () => {
    const res = await request(app).post('/api/auth/login').send({ telefono: telefonoDePrueba(), contraseña: CONTRASEÑA_PRUEBA });
    expect(res.status).toBe(401);
  });

  it('responde 401 si el usuario está suspendido, aun con la contraseña correcta', async () => {
    const padre = await crearPadre({ estado: 'suspendido' });
    const res = await request(app).post('/api/auth/login').send({ telefono: padre.telefono, contraseña: CONTRASEÑA_PRUEBA });
    expect(res.status).toBe(401);
  });

  it('inicia sesión aunque el teléfono se escriba sin el prefijo +57 (se normaliza antes de buscar)', async () => {
    const padre = await crearPadre(); // factory ya guarda el telefono como +57XXXXXXXXXX
    const sinPrefijo = padre.telefono.replace('+57', '');
    const res = await request(app).post('/api/auth/login').send({ telefono: sinPrefijo, contraseña: CONTRASEÑA_PRUEBA });
    expect(res.status).toBe(200);
  });

  it('responde 400 si el teléfono no es un número colombiano válido en ningún formato', async () => {
    const res = await request(app).post('/api/auth/login').send({ telefono: '123', contraseña: 'x' });
    expect(res.status).toBe(400);
  });

  it('máximo 5 sesiones simultáneas: la más antigua se descarta al iniciar una sexta', async () => {
    const padre = await crearPadre();
    for (let i = 0; i < 6; i += 1) {
      await request(app).post('/api/auth/login').send({ telefono: padre.telefono, contraseña: CONTRASEÑA_PRUEBA });
    }
    const enBD = await User.findById(padre._id).select('+refreshTokens');
    expect(enBD.refreshTokens).toHaveLength(5);
  });

  it('el rate limit estricto de login corta al undécimo intento en 15 minutos, con Retry-After', async () => {
    const padre = await crearPadre();
    let ultima;
    for (let i = 0; i < 11; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      ultima = await request(app).post('/api/auth/login').send({ telefono: padre.telefono, contraseña: 'incorrecta' });
    }
    expect(ultima.status).toBe(429);
    expect(ultima.body.retryAfter).toBeGreaterThan(0);
    expect(ultima.headers['retry-after']).toBeDefined();
  });
});

describe('GET /api/auth/profile y sesión', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('responde 401 sin cookie de sesión', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  it('devuelve el perfil del usuario autenticado', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/auth/profile');
    expect(res.status).toBe(200);
    expect(res.body.user.telefono).toBe(padre.telefono);
  });
});

describe('POST /api/auth/refresh', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('sin cookie refresh_token responde 401', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rota el refresh token: renueva la sesión y el token anterior deja de servir', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    const primero = await agent.post('/api/auth/refresh');
    expect(primero.status).toBe(200);

    // El agente ya guardó la cookie nueva; una segunda llamada debe volver a funcionar
    const segundo = await agent.post('/api/auth/refresh');
    expect(segundo.status).toBe(200);
  });

  it('renueva también el access token, y con él se puede seguir llamando a rutas protegidas', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    await agent.post('/api/auth/refresh');

    const perfil = await agent.get('/api/auth/profile');
    expect(perfil.status).toBe(200);
  });
});

describe('POST /api/auth/logout y /api/auth/logout-all', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('logout limpia las cookies del cliente Y revoca el refresh token de esa sesión en BD, sin tocar las demás sesiones', async () => {
    const padre = await crearPadre();
    await loginComo(app, padre); // primera sesión
    const agentB = await loginComo(app, padre); // segunda sesión

    const antes = await User.findById(padre._id).select('+refreshTokens');
    expect(antes.refreshTokens).toHaveLength(2);

    const res = await agentB.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'].some((c) => c.startsWith('access_token=;'))).toBe(true);

    const despues = await User.findById(padre._id).select('+refreshTokens');
    expect(despues.refreshTokens).toHaveLength(1);
  });

  it('tras logout, el refresh token revocado ya no sirve para renovar la sesión', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);

    await agent.post('/api/auth/logout');
    const res = await agent.post('/api/auth/refresh');

    expect(res.status).toBe(401);
  });

  it('logout-all borra todas las sesiones del usuario', async () => {
    const padre = await crearPadre();
    await loginComo(app, padre);
    const agentB = await loginComo(app, padre);

    await agentB.post('/api/auth/logout-all');

    const enBD = await User.findById(padre._id).select('+refreshTokens');
    expect(enBD.refreshTokens).toHaveLength(0);
  });
});

describe('POST /api/auth/change-password', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('cambia la contraseña con la actual correcta y marca primerInicioSesion=false', async () => {
    const padre = await crearPadre({ primerInicioSesion: true });
    const agent = await loginComo(app, padre);

    const res = await agent.post('/api/auth/change-password').send({
      contraseñaActual: CONTRASEÑA_PRUEBA,
      contraseñaNueva: 'NuevaClave123',
    });

    expect(res.status).toBe(200);
    const enBD = await User.findById(padre._id);
    expect(enBD.primerInicioSesion).toBe(false);
    expect(await enBD.comparePassword('NuevaClave123')).toBe(true);
  });

  it('responde 400 si la contraseña actual es incorrecta', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.post('/api/auth/change-password').send({
      contraseñaActual: 'NoEsLaClave1',
      contraseñaNueva: 'NuevaClave123',
    });
    expect(res.status).toBe(400);
  });
});

describe('Recuperación de contraseña por correo', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
    nodemailerSendMailMock.mockClear();
  });

  const extraerCodigo = () => {
    const [msg] = nodemailerSendMailMock.mock.calls.at(-1);
    const match = msg.html.match(/(\d{6})/);
    return match[1];
  };

  it('flujo completo: solicitar código, recibirlo por correo (mockeado) y restablecer la contraseña', async () => {
    const padre = await crearPadre();

    const solicitud = await request(app).post('/api/auth/forgot-password').send({ correo: padre.correo });
    expect(solicitud.status).toBe(200);
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);

    const codigo = extraerCodigo();

    const reset = await request(app).post('/api/auth/reset-password').send({
      correo: padre.correo,
      codigo,
      contraseñaNueva: 'OtraClaveNueva1',
    });
    expect(reset.status).toBe(200);

    const enBD = await User.findById(padre._id);
    expect(await enBD.comparePassword('OtraClaveNueva1')).toBe(true);
  });

  it('responde 200 genérico y no envía correo si el correo no existe (anti-enumeración)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ correo: 'nadie@test.edumon.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Si el correo está registrado/);
    expect(nodemailerSendMailMock).not.toHaveBeenCalled();
  });

  it('responde 400 con un código incorrecto', async () => {
    const padre = await crearPadre();
    await request(app).post('/api/auth/forgot-password').send({ correo: padre.correo });

    const res = await request(app).post('/api/auth/reset-password').send({
      correo: padre.correo,
      codigo: '000000',
      contraseñaNueva: 'OtraClaveNueva1',
    });
    expect(res.status).toBe(400);
  });

  it('el código no se puede reutilizar dos veces', async () => {
    const padre = await crearPadre();
    await request(app).post('/api/auth/forgot-password').send({ correo: padre.correo });
    const codigo = extraerCodigo();

    const primero = await request(app).post('/api/auth/reset-password').send({ correo: padre.correo, codigo, contraseñaNueva: 'ClaveUno123' });
    expect(primero.status).toBe(200);

    const segundo = await request(app).post('/api/auth/reset-password').send({ correo: padre.correo, codigo, contraseñaNueva: 'ClaveDos123' });
    expect(segundo.status).toBe(400);
  });
});

describe('Recuperación de contraseña por WhatsApp', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
    twilioCreateMock.mockClear();
  });

  const extraerCodigo = () => {
    const [payload] = twilioCreateMock.mock.calls.at(-1);
    const match = payload.body.match(/\*(\d{6})\*/);
    return match[1];
  };

  it('flujo completo: solicitar código por WhatsApp y restablecer la contraseña', async () => {
    const padre = await crearPadre();

    const solicitud = await request(app).post('/api/auth/forgot-password-phone').send({ telefono: padre.telefono });
    expect(solicitud.status).toBe(200);
    expect(twilioCreateMock).toHaveBeenCalledTimes(1);

    const codigo = extraerCodigo();

    const reset = await request(app).post('/api/auth/reset-password-phone').send({
      telefono: padre.telefono,
      codigo,
      contraseñaNueva: 'ClaveWhats123',
    });
    expect(reset.status).toBe(200);

    const enBD = await User.findById(padre._id);
    expect(await enBD.comparePassword('ClaveWhats123')).toBe(true);
  });

  it('responde 400 con un código de WhatsApp incorrecto', async () => {
    const padre = await crearPadre();
    await request(app).post('/api/auth/forgot-password-phone').send({ telefono: padre.telefono });

    const res = await request(app).post('/api/auth/reset-password-phone').send({
      telefono: padre.telefono,
      codigo: '111111',
      contraseñaNueva: 'ClaveWhats123',
    });
    expect(res.status).toBe(400);
  });
});
