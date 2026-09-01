import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmailStrategy } from '../../../src/notifications/strategies/EmailStrategy.js';
import { nodemailerSendMailMock } from '../../setup/mocks.js';
import { crearPadre } from '../../helpers/factories.js';

describe('EmailStrategy', () => {
  beforeEach(() => {
    nodemailerSendMailMock.mockClear();
  });

  it('nombre() es "email"', () => {
    expect(new EmailStrategy().nombre()).toBe('email');
  });

  it('devuelve false y no llama a SMTP si el usuario no tiene correo', async () => {
    const usuario = await crearPadre({ correo: undefined });
    const resultado = await new EmailStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });

    expect(resultado).toBe(false);
    expect(nodemailerSendMailMock).not.toHaveBeenCalled();
  });

  it('devuelve false si no hay SMTP_HOST configurado', async () => {
    const original = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const usuario = await crearPadre();
      const resultado = await new EmailStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });
      expect(resultado).toBe(false);
      expect(nodemailerSendMailMock).not.toHaveBeenCalled();
    } finally {
      process.env.SMTP_HOST = original;
    }
  });

  it('envía el correo vía SMTP y devuelve true', async () => {
    const usuario = await crearPadre();
    const notificacion = { tipo: 'calificacion', mensaje: 'Tu tarea fue calificada con 5 estrellas' };

    const resultado = await new EmailStrategy().enviar(usuario, notificacion);

    expect(resultado).toBe(true);
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
    const [msg] = nodemailerSendMailMock.mock.calls[0];
    expect(msg.to.address).toBe(usuario.correo);
    expect(msg.html).toContain('Tu tarea fue calificada con 5 estrellas');
    expect(msg.from.address).toBe(process.env.SMTP_FROM_EMAIL);
  });

  it('devuelve false (sin lanzar) si el servidor SMTP responde con error', async () => {
    const usuario = await crearPadre();
    nodemailerSendMailMock.mockRejectedValueOnce(new Error('clave inválida'));

    const resultado = await new EmailStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });
    expect(resultado).toBe(false);
  });
});
