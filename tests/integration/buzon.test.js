import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import Buzon from '../../src/models/Buzon.js';
import { crearMensajeBuzon, crearSuperadmin, crearPadre, telefonoDePrueba } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import { axiosPostMock } from '../setup/mocks.js';

// buzonRateLimit (en src/middlewares/validators/buzonValidator.js) es un
// singleton creado a nivel de módulo — a diferencia de los rate limiters de
// app.js (que se recrean en cada crearApp()), este persiste durante todo el
// archivo de test porque el módulo solo se importa una vez. Como
// "trust proxy" está activo, cada test usa un X-Forwarded-For distinto para
// obtener su propio balde de rate limit y no pisar el conteo de otros tests
// (excepto el test que prueba el límite a propósito, que reutiliza una IP fija).
let contadorIp = 0;
const ipDePrueba = () => `10.0.${Math.floor((contadorIp += 1) / 255)}.${contadorIp % 255}`;

const esperarLlamada = async (mockFn, timeoutMs = 2000) => {
  const inicio = Date.now();
  while (mockFn.mock.calls.length === 0) {
    if (Date.now() - inicio > timeoutMs) throw new Error('Timeout esperando la llamada al mock');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe('POST /api/buzon — pública', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
    axiosPostMock.mockClear();
  });

  it('cualquier visitante (sin autenticar) puede enviar un mensaje', async () => {
    const res = await request(app).post('/api/buzon').set('X-Forwarded-For', ipDePrueba()).send({
      nombre: 'Interesado', correo: 'interesado@test.edumon.com', telefono: telefonoDePrueba(),
      mensaje: 'Quiero información sobre el colegio',
    });
    expect(res.status).toBe(201);
    const enBD = await Buzon.find({});
    expect(enBD).toHaveLength(1);
  });

  it('notifica al superadmin cuando llega un mensaje (si existe uno)', async () => {
    await crearSuperadmin();
    const res = await request(app).post('/api/buzon').set('X-Forwarded-For', ipDePrueba()).send({
      nombre: 'Interesado', correo: 'interesado@test.edumon.com', telefono: telefonoDePrueba(),
      mensaje: 'Quiero información sobre el colegio',
    });
    expect(res.status).toBe(201);
    // El observer publica el evento de forma asíncrona (no bloquea la respuesta HTTP)
    await esperarLlamada(axiosPostMock);
    expect(axiosPostMock).toHaveBeenCalled();
  });

  it('rechaza un mensaje demasiado corto', async () => {
    const res = await request(app).post('/api/buzon').set('X-Forwarded-For', ipDePrueba()).send({
      nombre: 'X', correo: 'x@test.edumon.com', telefono: telefonoDePrueba(), mensaje: 'corto',
    });
    expect(res.status).toBe(400);
  });

  it('rechaza un teléfono que no está en formato +57', async () => {
    const res = await request(app).post('/api/buzon').set('X-Forwarded-For', ipDePrueba()).send({
      nombre: 'X', correo: 'x@test.edumon.com', telefono: '3001112233', mensaje: 'Mensaje con longitud suficiente',
    });
    expect(res.status).toBe(400);
  });

  it('el rate limit público (3 cada 15 min por IP) corta al cuarto envío', async () => {
    const ip = ipDePrueba();
    const datos = () => ({
      nombre: 'Repetido', correo: 'repetido@test.edumon.com', telefono: telefonoDePrueba(), mensaje: 'Mensaje repetido válido',
    });
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await request(app).post('/api/buzon').set('X-Forwarded-For', ip).send(datos());
      expect(ok.status).toBe(201);
    }
    const cuarto = await request(app).post('/api/buzon').set('X-Forwarded-For', ip).send(datos());
    expect(cuarto.status).toBe(429);
  });
});

describe('GET /api/buzon y PATCH /:id/leido — solo superadmin', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('un padre no puede leer el buzón', async () => {
    const padre = await crearPadre();
    const agent = await loginComo(app, padre);
    const res = await agent.get('/api/buzon');
    expect(res.status).toBe(403);
  });

  it('el superadmin lista los mensajes y puede marcarlos como leídos', async () => {
    const mensaje = await crearMensajeBuzon();
    const superadmin = await crearSuperadmin();
    const agent = await loginComo(app, superadmin);

    const lista = await agent.get('/api/buzon');
    expect(lista.status).toBe(200);
    expect(lista.body.mensajes.length).toBeGreaterThanOrEqual(1);

    const marcar = await agent.patch(`/api/buzon/${mensaje._id}/leido`);
    expect(marcar.status).toBe(200);
    expect((await Buzon.findById(mensaje._id)).leido).toBe(true);
  });
});
