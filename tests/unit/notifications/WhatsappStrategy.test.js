import { describe, it, expect, beforeEach } from 'vitest';
import { WhatsAppStrategy } from '../../../src/notifications/strategies/WhatsappStrategy.js';
import { twilioCreateMock } from '../../setup/mocks.js';
import { crearPadre } from '../../helpers/factories.js';

describe('WhatsAppStrategy', () => {
  beforeEach(() => {
    twilioCreateMock.mockClear();
  });

  it('nombre() es "whatsapp"', () => {
    expect(new WhatsAppStrategy().nombre()).toBe('whatsapp');
  });

  it('devuelve false y no llama a Twilio si el usuario no tiene teléfono', async () => {
    const usuario = await crearPadre({ telefono: undefined });
    const resultado = await new WhatsAppStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });

    expect(resultado).toBe(false);
    expect(twilioCreateMock).not.toHaveBeenCalled();
  });

  it('envía el mensaje por WhatsApp con from/to en formato whatsapp: y devuelve true', async () => {
    const usuario = await crearPadre({ telefono: '+573001112233' });
    const notificacion = { tipo: 'evento', mensaje: 'Reunión mañana a las 10am' };

    const resultado = await new WhatsAppStrategy().enviar(usuario, notificacion);

    expect(resultado).toBe(true);
    expect(twilioCreateMock).toHaveBeenCalledTimes(1);
    const [payload] = twilioCreateMock.mock.calls[0];
    expect(payload.to).toBe('whatsapp:+573001112233');
    expect(payload.from).toMatch(/^whatsapp:/);
    expect(payload.body).toContain('Reunión mañana a las 10am');
  });

  it('devuelve false (sin lanzar) si Twilio falla', async () => {
    const usuario = await crearPadre({ telefono: '+573001112233' });
    twilioCreateMock.mockRejectedValueOnce(new Error('número inválido'));

    const resultado = await new WhatsAppStrategy().enviar(usuario, { tipo: 'sistema', mensaje: 'hola' });

    expect(resultado).toBe(false);
  });
});
