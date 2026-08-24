import request from 'supertest';
import { CONTRASEÑA_PRUEBA } from './factories.js';

/**
 * Inicia sesión de verdad contra POST /api/auth/login y devuelve un agente
 * supertest con las cookies (access_token + refresh_token) ya guardadas, para
 * que los tests de integración ejerciten la pila real de autenticación
 * (JWT + cookies httpOnly) en vez de fabricar un token a mano.
 */
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
