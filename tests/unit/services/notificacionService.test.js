import { describe, it, expect, beforeEach } from 'vitest';
import {
  enviarEmail,
  crearYEnviarNotificacion,
  notificarTareaProximaVencer
} from '../../../src/services/notificacionService.js';
import Notificacion from '../../../src/models/Notificacion.js';
import Entrega from '../../../src/models/Entrega.js';
import { axiosPostMock, fcmSendMock, twilioCreateMock } from '../../setup/mocks.js';
import { crearPadre, crearDocente, crearTarea, crearCurso } from '../../helpers/factories.js';

describe('enviarEmail', () => {
  beforeEach(() => {
    axiosPostMock.mockClear();
  });

  it('envía el correo vía la API de Brevo (no MailerSend)', async () => {
    const usuario = await crearPadre();
    const notificacion = { tipo: 'tarea', mensaje: 'Nueva tarea publicada' };

    await enviarEmail(usuario, notificacion);

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = axiosPostMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(body.to[0].email).toBe(usuario.correo);
    expect(body.sender.email).toBe(process.env.BREVO_SENDER_EMAIL);
    expect(config.headers['api-key']).toBe(process.env.BREVO_API_KEY);
  });

  it('no llama a Brevo si el usuario no tiene correo', async () => {
    const usuario = await crearPadre({ correo: undefined });
    await enviarEmail(usuario, { tipo: 'tarea', mensaje: 'x' });
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('lanza si BREVO_API_KEY no está configurada', async () => {
    const original = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    try {
      const usuario = await crearPadre();
      await expect(enviarEmail(usuario, { tipo: 'tarea', mensaje: 'x' })).rejects.toThrow('Brevo no configurado');
      expect(axiosPostMock).not.toHaveBeenCalled();
    } finally {
      process.env.BREVO_API_KEY = original;
    }
  });
});

describe('crearYEnviarNotificacion', () => {
  beforeEach(() => {
    axiosPostMock.mockClear();
    fcmSendMock.mockClear();
    twilioCreateMock.mockClear();
  });

  it('guarda la notificación y marca websocket + email + whatsapp como enviados para un padre', async () => {
    const padre = await crearPadre({ fcmToken: null });

    const notificacion = await crearYEnviarNotificacion({
      usuarioId: padre._id,
      tipo: 'tarea',
      mensaje: 'Nueva tarea: "Ensayo sobre el agua"'
    });

    const guardada = await Notificacion.findById(notificacion._id);
    expect(guardada).not.toBeNull();
    expect(guardada.canalEnviado.websocket).toBe(true);
    expect(guardada.canalEnviado.email).toBe(true);
    expect(guardada.canalEnviado.whatsapp).toBe(true);
    expect(guardada.canalEnviado.push).toBe(false);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(twilioCreateMock).toHaveBeenCalledTimes(1);
  });

  it('a un docente NO le envía email para tipo "tarea" (solo entrega/sistema) ni WhatsApp', async () => {
    const docente = await crearDocente();

    const notificacion = await crearYEnviarNotificacion({
      usuarioId: docente._id,
      tipo: 'tarea',
      mensaje: 'Aviso de prueba'
    });

    const guardada = await Notificacion.findById(notificacion._id);
    expect(guardada.canalEnviado.email).toBe(false);
    expect(guardada.canalEnviado.whatsapp).toBe(false);
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(twilioCreateMock).not.toHaveBeenCalled();
  });

  it('a un docente SÍ le envía email para tipo "entrega"', async () => {
    const docente = await crearDocente();

    const notificacion = await crearYEnviarNotificacion({
      usuarioId: docente._id,
      tipo: 'entrega',
      mensaje: 'Un padre entregó la tarea'
    });

    const guardada = await Notificacion.findById(notificacion._id);
    expect(guardada.canalEnviado.email).toBe(true);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
  });
});

describe('notificarTareaProximaVencer', () => {
  beforeEach(() => {
    axiosPostMock.mockClear();
  });

  it('notifica solo a los padres que aún no han entregado', async () => {
    const curso = await crearCurso();
    const padreAlDia = await crearPadre();
    const padrePendiente = await crearPadre();
    curso.agregarParticipante(padreAlDia._id, 'padre');
    curso.agregarParticipante(padrePendiente._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({ cursoId: curso._id, asignacionTipo: 'todos' });
    await Entrega.create({ tareaId: tarea._id, padreId: padreAlDia._id, estado: 'enviada' });

    await notificarTareaProximaVencer(tarea);

    const notificaciones = await Notificacion.find({ referenciaId: tarea._id });
    const destinatarios = notificaciones.map((n) => n.usuarioId.toString());

    expect(destinatarios).toContain(padrePendiente._id.toString());
    expect(destinatarios).not.toContain(padreAlDia._id.toString());
  });
});
