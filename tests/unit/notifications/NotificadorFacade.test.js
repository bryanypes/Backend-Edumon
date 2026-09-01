import { describe, it, expect, beforeEach } from 'vitest';
import notificador from '../../../src/notifications/NotificadorFacade.js';
import Notificacion from '../../../src/models/Notificacion.js';
import { crearPadre, crearPerfilFamiliar } from '../../helpers/factories.js';
import { fcmSendMock, nodemailerSendMailMock, twilioCreateMock } from '../../setup/mocks.js';

describe('NotificadorFacade — notificar (usuario individual)', () => {
  beforeEach(() => {
    fcmSendMock.mockClear();
    nodemailerSendMailMock.mockClear();
    twilioCreateMock.mockClear();
  });

  it('guarda la notificación en BD y marca canalEnviado según lo que cada estrategia logró enviar', async () => {
    const usuario = await crearPadre({ fcmToken: 'token-1' });

    const notificacion = await notificador.notificar(usuario._id, {
      tipo: 'tarea',
      mensaje: 'Nueva tarea de matemáticas',
      referenciaId: usuario._id,
      referenciaModelo: 'User',
    });

    expect(notificacion).not.toBeNull();
    expect(notificacion.canalEnviado.websocket).toBe(true);
    expect(notificacion.canalEnviado.push).toBe(true);
    expect(notificacion.canalEnviado.email).toBe(true);
    expect(notificacion.canalEnviado.whatsapp).toBe(true);

    const enBD = await Notificacion.findById(notificacion._id);
    expect(enBD.mensaje).toBe('Nueva tarea de matemáticas');
  });

  it('canalEnviado.push queda en false si el usuario no tiene fcmToken (la estrategia simplemente no aplica)', async () => {
    const usuario = await crearPadre({ fcmToken: null });
    const notificacion = await notificador.notificar(usuario._id, { tipo: 'sistema', mensaje: 'hola' });
    expect(notificacion.canalEnviado.push).toBe(false);
  });

  it('devuelve null y no crea notificación si el usuario no existe', async () => {
    const resultado = await notificador.notificar('507f1f77bcf86cd799439011', { tipo: 'sistema', mensaje: 'hola' });
    expect(resultado).toBeNull();
  });

  it('devuelve null si el usuario está suspendido (no se le notifica)', async () => {
    const usuario = await crearPadre({ estado: 'suspendido' });
    const resultado = await notificador.notificar(usuario._id, { tipo: 'sistema', mensaje: 'hola' });
    expect(resultado).toBeNull();
    expect(await Notificacion.countDocuments({ usuarioId: usuario._id })).toBe(0);
  });

  it('prioridad por defecto es "critica" si no se especifica', async () => {
    const usuario = await crearPadre();
    const notificacion = await notificador.notificar(usuario._id, { tipo: 'sistema', mensaje: 'hola' });
    expect(notificacion.prioridad).toBe('critica');
  });
});

describe('NotificadorFacade — notificarFamilia', () => {
  beforeEach(() => {
    fcmSendMock.mockClear();
  });

  it('notifica al titular por todos los canales y por push a los perfiles familiares activos con fcmToken', async () => {
    const titular = await crearPadre({ fcmToken: 'token-titular' });
    await crearPerfilFamiliar({ titularId: titular._id, nombre: 'Hijo 1', activo: true, fcmToken: 'token-hijo-1' });
    await crearPerfilFamiliar({ titularId: titular._id, nombre: 'Hijo 2', activo: true, fcmToken: null });
    await crearPerfilFamiliar({ titularId: titular._id, nombre: 'Hijo 3', activo: false, fcmToken: 'token-hijo-3' });

    await notificador.notificarFamilia(titular._id, { tipo: 'evento', mensaje: 'Reunión de padres' });

    // 1 push al titular + 1 push al único perfil activo con fcmToken (Hijo 1)
    expect(fcmSendMock).toHaveBeenCalledTimes(2);
    const tokensNotificados = fcmSendMock.mock.calls.map(([msg]) => msg.token);
    expect(tokensNotificados).toContain('token-titular');
    expect(tokensNotificados).toContain('token-hijo-1');
    expect(tokensNotificados).not.toContain('token-hijo-3');
  });

  it('no falla si el titular no tiene perfiles familiares', async () => {
    const titular = await crearPadre();
    await expect(notificador.notificarFamilia(titular._id, { tipo: 'sistema', mensaje: 'hola' })).resolves.toBeUndefined();
  });
});

describe('NotificadorFacade — notificarMultiples / notificarFamilias', () => {
  it('notificarMultiples notifica a todos los usuarios de la lista aunque alguno falle', async () => {
    const a = await crearPadre();
    const b = await crearPadre();
    const idInexistente = '507f1f77bcf86cd799439011';

    await notificador.notificarMultiples([a._id, idInexistente, b._id], { tipo: 'sistema', mensaje: 'hola a todos' });

    expect(await Notificacion.countDocuments({ usuarioId: a._id })).toBe(1);
    expect(await Notificacion.countDocuments({ usuarioId: b._id })).toBe(1);
  });

  it('notificarFamilias expande cada usuario a su familia sin lanzar si alguno falla', async () => {
    const a = await crearPadre();
    const idInexistente = '507f1f77bcf86cd799439011';

    await expect(
      notificador.notificarFamilias([a._id, idInexistente], { tipo: 'sistema', mensaje: 'hola familias' }),
    ).resolves.toBeUndefined();

    expect(await Notificacion.countDocuments({ usuarioId: a._id })).toBe(1);
  });
});
