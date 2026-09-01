import request from 'supertest';
import { CONTRASEÑA_PRUEBA } from './factories.js';

// login real contra la API (no un token fabricado a mano), devuelve el agente con las cookies ya puestas
export async function loginComo(app, usuario, contraseña = CONTRASEÑA_PRUEBA) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ telefono: usuario.telefono, contraseña });

  if (res.status !== 200) {
    throw new Error(
      `Login de prueba falló para ${usuario.telefono} (status ${res.status}): ${JSON.stringify(res.body)}`,
    );
  }

  return agent;
}
