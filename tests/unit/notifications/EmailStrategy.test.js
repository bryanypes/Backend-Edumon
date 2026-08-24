import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmailStrategy } from '../../../src/notifications/strategies/EmailStrategy.js';
import { axiosPostMock } from '../../setup/mocks.js';
import { crearPadre } from '../../helpers/factories.js';

describe('EmailStrategy', () => {
  beforeEach(() => {
    axiosPostMock.mockClear();
  });

  it('nombre() es "email"', () => {
    expect(new EmailStrategy().nombre()).toBe('email');
  });

  it('devuelve false y no llama a Brevo si el usuario no tiene correo', async () => {
    const usuario = await crearPadre({ correo: undefined });
    const resultado = await new EmailStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });

    expect(resultado).toBe(false);
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('devuelve false si no hay BREVO_API_KEY configurada', async () => {
    const original = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    try {
      const usuario = await crearPadre();
      const resultado = await new EmailStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });
      expect(resultado).toBe(false);
      expect(axiosPostMock).not.toHaveBeenCalled();
    } finally {
      process.env.BREVO_API_KEY = original;
    }
  });

  it('envía el correo vía la API de Brevo y devuelve true', async () => {
    const usuario = await crearPadre();
    const notificacion = { tipo: 'calificacion', mensaje: 'Tu tarea fue calificada con 5 estrellas' };

    const resultado = await new EmailStrategy().enviar(usuario, notificacion);

    expect(resultado).toBe(true);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = axiosPostMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(body.to[0].email).toBe(usuario.correo);
    expect(body.htmlContent).toContain('Tu tarea fue calificada con 5 estrellas');
    expect(config.headers['api-key']).toBe(process.env.BREVO_API_KEY);
  });

  it('devuelve false (sin lanzar) si Brevo responde con error', async () => {
    const usuario = await crearPadre();
    axiosPostMock.mockRejectedValueOnce({ response: { data: { message: 'clave inválida' } } });

    const resultado = await new EmailStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });
    expect(resultado).toBe(false);
  });
});
