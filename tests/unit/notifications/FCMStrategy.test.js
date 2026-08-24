import { describe, it, expect, beforeEach } from 'vitest';
import { FCMStrategy } from '../../../src/notifications/strategies/FCMStrategy.js';
import { fcmSendMock } from '../../setup/mocks.js';
import { crearPadre } from '../../helpers/factories.js';
import User from '../../../src/models/User.js';

describe('FCMStrategy', () => {
  beforeEach(() => {
    fcmSendMock.mockClear();
  });

  it('nombre() es "push"', () => {
    expect(new FCMStrategy().nombre()).toBe('push');
  });

  it('devuelve false y no llama a FCM si el usuario no tiene fcmToken', async () => {
    const usuario = await crearPadre({ fcmToken: null });
    const resultado = await new FCMStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola', _id: 'x' });

    expect(resultado).toBe(false);
    expect(fcmSendMock).not.toHaveBeenCalled();
  });

  it('envía el push y devuelve true si el usuario tiene fcmToken', async () => {
    const usuario = await crearPadre({ fcmToken: 'token-abc' });
    const notificacion = { _id: '507f1f77bcf86cd799439011', tipo: 'tarea', mensaje: 'Nueva tarea asignada' };

    const resultado = await new FCMStrategy().enviar(usuario, notificacion);

    expect(resultado).toBe(true);
    expect(fcmSendMock).toHaveBeenCalledTimes(1);
    const [mensajeEnviado] = fcmSendMock.mock.calls[0];
    expect(mensajeEnviado.token).toBe('token-abc');
    expect(mensajeEnviado.notification.body).toBe('Nueva tarea asignada');
    expect(mensajeEnviado.data.tipo).toBe('tarea');
  });

  it('si el token está expirado (registration-token-not-registered), lo limpia en el usuario y devuelve false', async () => {
    const usuario = await crearPadre({ fcmToken: 'token-vencido' });
    fcmSendMock.mockRejectedValueOnce(Object.assign(new Error('vencido'), { code: 'messaging/registration-token-not-registered' }));

    const resultado = await new FCMStrategy().enviar(usuario, { _id: 'x', tipo: 'sistema', mensaje: 'hola' });

    expect(resultado).toBe(false);
    const actualizado = await User.findById(usuario._id);
    expect(actualizado.fcmToken).toBeNull();
  });

  it('devuelve false (sin lanzar) ante cualquier otro error de FCM', async () => {
    const usuario = await crearPadre({ fcmToken: 'token-x' });
    fcmSendMock.mockRejectedValueOnce(new Error('servicio caído'));

    const resultado = await new FCMStrategy().enviar(usuario, { _id: 'x', tipo: 'sistema', mensaje: 'hola' });

    expect(resultado).toBe(false);
  });
});
