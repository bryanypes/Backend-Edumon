import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Notificacion from '../../src/models/Notificacion.js';
import Tarea from '../../src/models/Tarea.js';
import {
  crearInstitucion, crearAdministrador, crearSuperadmin, crearDocente, crearPadre, crearCurso, crearModulo, crearTarea, crearEvento,
} from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import { fcmSendMock, nodemailerSendMailMock } from '../setup/mocks.js';

async function colegioConCurso() {
  const institucion = await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: institucion._id });
  const docente = await crearDocente({ institucionId: institucion._id });
  const curso = await crearCurso({ institucionId: institucion._id, docenteId: docente._id });
  const familias = [
    await crearPadre({ fcmToken: 'token-familia-1', correo: 'mama.real@gmail.com' }),
    await crearPadre({ correo: '34319996@temp.com' }),
  ];
  familias.forEach((f) => curso.participantes.push({ usuarioId: f._id, etiqueta: 'padre' }));
  await curso.save();
  return { institucion, admin, docente, curso, familias };
}

describe('el administrador crea retos desde el panel del colegio', () => {
  it('el reto queda a nombre de la docente del curso (ella lo ve y recibe las entregas)', async () => {
    const { app } = crearApp();
    const { admin, docente, curso } = await colegioConCurso();
    const modulo = await crearModulo({ cursoId: curso._id });
    const res = await (await loginComo(app, admin)).post('/api/tareas').send({
      titulo: 'Reto de emergencia', descripcion: 'Creado por el colegio', fechaEntrega: new Date(Date.now() + 5 * 86400000).toISOString(),
      tipoEntrega: 'texto', cursoId: String(curso._id), moduloId: String(modulo._id), asignacionTipo: 'todos',
    });
    expect(res.status).toBe(201);
    const tarea = await Tarea.findOne({ titulo: 'Reto de emergencia' });
    expect(String(tarea.docenteId)).toBe(String(docente._id));
  });
});

describe('POST /api/notificaciones/enviar', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); fcmSendMock.mockClear(); nodemailerSendMailMock.mockClear(); });

  it('envía un aviso libre a las familias de un curso (push y app, sin correo)', async () => {
    const { admin, curso, familias } = await colegioConCurso();
    const res = await (await loginComo(app, admin)).post('/api/notificaciones/enviar').send({
      alcance: 'curso', cursoId: String(curso._id), titulo: 'Aviso del colegio', mensaje: 'Mañana no hay clases por jornada pedagógica.',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ destinatarios: 2, enviadas: 2, conPush: 1, fallidas: 0 });
    const notis = await Notificacion.find({ agrupacionId: res.body.agrupacionId });
    expect(notis.map((n) => String(n.usuarioId)).sort()).toEqual(familias.map((f) => String(f._id)).sort());
    expect(fcmSendMock).toHaveBeenCalledTimes(1);
    expect(fcmSendMock.mock.calls[0][0].notification?.title ?? JSON.stringify(fcmSendMock.mock.calls[0][0])).toMatch(/Aviso del colegio/);
    expect(nodemailerSendMailMock).not.toHaveBeenCalled();
  });

  it('con correo activado, solo escribe a correos reales (nunca a "@temp.com")', async () => {
    const { admin, curso } = await colegioConCurso();
    const res = await (await loginComo(app, admin)).post('/api/notificaciones/enviar').send({
      alcance: 'curso', cursoId: String(curso._id), mensaje: 'Aviso importante', correo: true,
    });
    expect(res.status).toBe(201);
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(nodemailerSendMailMock.mock.calls[0][0])).toMatch(/mama\.real@gmail\.com/);
  });

  it('recuerda un reto con mensaje automático y enlace al reto', async () => {
    const { admin, curso } = await colegioConCurso();
    const tarea = await crearTarea({ cursoId: curso._id, titulo: 'Transición armónica' });
    const res = await (await loginComo(app, admin)).post('/api/notificaciones/enviar').send({
      alcance: 'curso', cursoId: String(curso._id), tareaId: String(tarea._id),
    });
    expect(res.status).toBe(201);
    const noti = await Notificacion.findOne({ agrupacionId: res.body.agrupacionId });
    expect(noti).toMatchObject({ tipo: 'tarea', referenciaModelo: 'Tarea' });
    expect(noti.mensaje).toMatch(/Transición armónica/);
  });

  it('recuerda un evento del curso', async () => {
    const { admin, curso } = await colegioConCurso();
    const evento = await crearEvento({ cursosIds: [curso._id], titulo: 'Encuentro de familias' });
    const res = await (await loginComo(app, admin)).post('/api/notificaciones/enviar').send({
      alcance: 'curso', cursoId: String(curso._id), eventoId: String(evento._id), destinatarios: 'todos',
    });
    expect(res.status).toBe(201);
    expect(res.body.destinatarios).toBe(3); // 2 familias + la docente
  });

  it('a todo el colegio incluye a los docentes de la institución', async () => {
    const { admin, institucion } = await colegioConCurso();
    await crearDocente({ institucionId: institucion._id }); // docente sin cursos todavía
    const res = await (await loginComo(app, admin)).post('/api/notificaciones/enviar').send({
      alcance: 'colegio', destinatarios: 'docentes', mensaje: 'Reunión de docentes a las 2 p. m.',
    });
    expect(res.status).toBe(201);
    expect(res.body.destinatarios).toBe(2);
  });

  it('no permite cursos de otra institución, ni padres, ni datos incompletos', async () => {
    const { curso } = await colegioConCurso();
    const otro = await crearAdministrador({ institucionId: (await crearInstitucion())._id });
    expect((await (await loginComo(app, otro)).post('/api/notificaciones/enviar').send({ alcance: 'curso', cursoId: String(curso._id), mensaje: 'Hola a todos' })).status).toBe(403);
    const padre = await crearPadre();
    expect((await (await loginComo(app, padre)).post('/api/notificaciones/enviar').send({ alcance: 'colegio', mensaje: 'Hola a todos' })).status).toBe(403);
    const admin = await crearAdministrador({ institucionId: curso.institucionId });
    const agente = await loginComo(app, admin);
    expect((await agente.post('/api/notificaciones/enviar').send({ alcance: 'curso', cursoId: String(curso._id) })).status).toBe(400);
    expect((await agente.post('/api/notificaciones/enviar').send({ alcance: 'otro', mensaje: 'Hola a todos' })).status).toBe(400);
  });

  it('el superadmin indica la institución para avisar a todo un colegio', async () => {
    const { institucion } = await colegioConCurso();
    const sa = await loginComo(app, await crearSuperadmin());
    expect((await sa.post('/api/notificaciones/enviar').send({ alcance: 'colegio', mensaje: 'Aviso general' })).status).toBe(400);
    const res = await sa.post('/api/notificaciones/enviar').send({ alcance: 'colegio', institucionId: String(institucion._id), mensaje: 'Aviso general' });
    expect(res.status).toBe(201);
    expect(res.body.destinatarios).toBe(2);
  });
});
