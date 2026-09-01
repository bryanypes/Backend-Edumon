import { describe, it, expect, beforeEach } from 'vitest';
import {
  enviarEmail,
  crearYEnviarNotificacion,
  notificarTareaProximaVencer
} from '../../../src/services/notificacionService.js';
import Notificacion from '../../../src/models/Notificacion.js';
import Entrega from '../../../src/models/Entrega.js';
import { nodemailerSendMailMock, fcmSendMock, twilioCreateMock } from '../../setup/mocks.js';
import { crearPadre, crearDocente, crearTarea, crearCurso } from '../../helpers/factories.js';

describe('enviarEmail', () => {
  beforeEach(() => {
    nodemailerSendMailMock.mockClear();
  });

  it('envía el correo vía SMTP (nodemailer)', async () => {
    const usuario = await crearPadre();
    const notificacion = { tipo: 'tarea', mensaje: 'Nueva tarea publicada' };

    await enviarEmail(usuario, notificacion);

    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
    const [msg] = nodemailerSendMailMock.mock.calls[0];
    expect(msg.to.address).toBe(usuario.correo);
    expect(msg.from.address).toBe(process.env.SMTP_FROM_EMAIL);
  });

  it('no llama a SMTP si el usuario no tiene correo', async () => {
    const usuario = await crearPadre({ correo: undefined });
    await enviarEmail(usuario, { tipo: 'tarea', mensaje: 'x' });
    expect(nodemailerSendMailMock).not.toHaveBeenCalled();
  });

  it('lanza si SMTP_HOST no está configurado', async () => {
    const original = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const usuario = await crearPadre();
      await expect(enviarEmail(usuario, { tipo: 'tarea', mensaje: 'x' })).rejects.toThrow('SMTP no configurado');
      expect(nodemailerSendMailMock).not.toHaveBeenCalled();
    } finally {
      process.env.SMTP_HOST = original;
    }
  });
});

describe('crearYEnviarNotificacion', () => {
  beforeEach(() => {
    nodemailerSendMailMock.mockClear();
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
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
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
    expect(nodemailerSendMailMock).not.toHaveBeenCalled();
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
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
  });
});

describe('notificarTareaProximaVencer', () => {
  beforeEach(() => {
    nodemailerSendMailMock.mockClear();
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
