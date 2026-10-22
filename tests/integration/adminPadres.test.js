import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import Entrega from '../../src/models/Entrega.js';
import {
  crearInstitucion, crearAdministrador, crearPadre, crearCurso, crearModulo, crearTarea, crearEntrega, CONTRASEÑA_PRUEBA,
} from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

describe('el administrador gestiona a los padres de su institución', () => {
  let app, institucion, admin, padre, curso, entrega;

  beforeEach(async () => {
    ({ app } = crearApp());
    institucion = await crearInstitucion();
    admin = await crearAdministrador({ institucionId: institucion._id });
    padre = await crearPadre();
    curso = await crearCurso({ institucionId: institucion._id });
    curso.participantes.push({ usuarioId: padre._id, etiqueta: 'padre' });
    await curso.save();
    const modulo = await crearModulo({ cursoId: curso._id });
    const tarea = await crearTarea({ cursoId: curso._id, moduloId: modulo._id, docenteId: curso.docenteId });
    entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id });
  });

  const login = (telefono, contraseña) => request(app).post('/api/auth/login').send({ telefono, contraseña });

  it('edita nombre, apellido, cédula, teléfono y correo sin tocar sus entregas', async () => {
    const agente = await loginComo(app, admin);
    const res = await agente.put(`/api/users/${padre._id}`).send({
      nombre: 'Luisa Ximena', apellido: 'Buesaquillo', cedula: '1067599204', telefono: '+573207404534', correo: ' Luisa@Correo.com ',
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ nombre: 'Luisa Ximena', cedula: '1067599204', telefono: '+573207404534', correo: 'luisa@correo.com' });
    const sigue = await Entrega.findById(entrega._id);
    expect(String(sigue.padreId)).toBe(String(padre._id));
  });

  it('puede dejar al padre sin correo', async () => {
    const res = await (await loginComo(app, admin)).put(`/api/users/${padre._id}`).send({ correo: '' });
    expect(res.status).toBe(200);
    expect((await User.findById(padre._id)).correo).toBeUndefined();
  });

  it('pone una contraseña nueva y cierra las sesiones abiertas del padre', async () => {
    const sesionPadre = await loginComo(app, padre);
    const res = await (await loginComo(app, admin)).patch(`/api/users/${padre._id}/contrasena`).send({ contraseña: 'NuevaClave2026' });
    expect(res.status).toBe(200);
    expect(res.body.primerInicioSesion).toBe(false);
    expect((await login(padre.telefono, CONTRASEÑA_PRUEBA)).status).toBe(401);
    expect((await login(padre.telefono, 'NuevaClave2026')).status).toBe(200);
    expect((await sesionPadre.post('/api/auth/refresh')).status).toBe(401);
    expect(await Entrega.countDocuments({ padreId: padre._id })).toBe(1);
  });

  it('restablece a la cédula y obliga a cambiarla al entrar', async () => {
    const res = await (await loginComo(app, admin)).patch(`/api/users/${padre._id}/contrasena`).send({ restablecer: true });
    expect(res.status).toBe(200);
    const entra = await login(padre.telefono, padre.cedula);
    expect(entra.status).toBe(200);
    expect(entra.body.user.primerInicioSesion).toBe(true);
  });

  it('valida la contraseña nueva', async () => {
    const agente = await loginComo(app, admin);
    expect((await agente.patch(`/api/users/${padre._id}/contrasena`).send({ contraseña: '123' })).status).toBe(400);
    expect((await agente.patch(`/api/users/${padre._id}/contrasena`).send({})).status).toBe(400);
  });

  it('no puede tocar padres de otra institución ni a otros administradores', async () => {
    const otraInst = await crearInstitucion();
    const otroAdmin = await crearAdministrador({ institucionId: otraInst._id });
    const agenteOtro = await loginComo(app, otroAdmin);
    expect((await agenteOtro.patch(`/api/users/${padre._id}/contrasena`).send({ restablecer: true })).status).toBe(403);
    const colega = await crearAdministrador({ institucionId: institucion._id });
    expect((await (await loginComo(app, admin)).patch(`/api/users/${colega._id}/contrasena`).send({ restablecer: true })).status).toBe(403);
  });

  it('un padre no puede usar la ruta', async () => {
    const otro = await crearPadre();
    expect((await (await loginComo(app, otro)).patch(`/api/users/${padre._id}/contrasena`).send({ restablecer: true })).status).toBe(403);
  });
});
