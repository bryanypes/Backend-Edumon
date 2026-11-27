import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Curso from '../../src/models/Curso.js';
import Institucion from '../../src/models/Institucion.js';
import Notificacion from '../../src/models/Notificacion.js';
import { diagnosticarUsuariosHuerfanos } from '../../src/scripts/diagnosticoUsuariosHuerfanos.js';
import {
  crearInstitucion,
  crearDocente,
  crearPadre,
  crearCurso,
  crearTarea,
  crearEntrega,
  crearForo,
  crearMensajeForo,
  crearPerfilFamiliar,
} from '../helpers/factories.js';

const conteos = async () => {
  const db = mongoose.connection.db;
  const nombres = [
    'users',
    'cursos',
    'entregas',
    'tareas',
    'perfilfamiliars',
    'mensajeforos',
    'notificacions',
    'institucions',
  ];
  return Object.fromEntries(await Promise.all(nombres.map(async (n) => [n, await db.collection(n).countDocuments()])));
};

describe('diagnóstico de usuarios huérfanos', () => {
  let institucion, docente, padre, padreQueSigue, curso;

  beforeEach(async () => {
    institucion = await crearInstitucion({ nombre: 'Colegio Ficticio Diagnóstico' });
    docente = await crearDocente({ institucionId: institucion._id });
    padre = await crearPadre();
    padreQueSigue = await crearPadre();
    curso = await crearCurso({
      nombre: 'Grado Quinto Ficticio',
      institucionId: institucion._id,
      docenteId: docente._id,
      participantes: [
        { usuarioId: docente._id, etiqueta: 'docente' },
        { usuarioId: padre._id, etiqueta: 'padre' },
        { usuarioId: padreQueSigue._id, etiqueta: 'padre' },
      ],
    });
    const tarea = await crearTarea({ cursoId: curso._id, docenteId: docente._id });
    await crearEntrega({ tareaId: tarea._id, padreId: padre._id });
    await crearEntrega({ tareaId: tarea._id, padreId: padreQueSigue._id });
    const foro = await crearForo({ cursoId: curso._id, docenteId: docente._id });
    await crearMensajeForo({ foroId: foro._id, usuarioId: padre._id });
    await crearPerfilFamiliar({ titularId: padre._id });
    await Notificacion.create({ usuarioId: padre._id, tipo: 'sistema', mensaje: 'Aviso ficticio' });
  });

  it('no reporta nada si todos los usuarios existen', async () => {
    expect(await diagnosticarUsuariosHuerfanos()).toEqual([]);
  });

  it('lista al usuario borrado con sus referencias, cursos e instituciones', async () => {
    await User.deleteOne({ _id: padre._id });

    const resultado = await diagnosticarUsuariosHuerfanos();

    expect(resultado).toHaveLength(1);
    const [huerfano] = resultado;
    expect(huerfano.usuarioId).toBe(String(padre._id));
    expect(huerfano.porCampo).toEqual({
      'cursos.participantes.usuarioId': 1,
      'entregas.padreId': 1,
      'perfilfamiliars.titularId': 1,
      'mensajeforos.usuarioId': 1,
      'notificacions.usuarioId': 1,
    });
    expect(huerfano.referencias).toBe(5);
    expect(huerfano.cursos).toEqual([{ id: String(curso._id), nombre: 'Grado Quinto Ficticio' }]);
    expect(huerfano.instituciones).toEqual([{ id: String(institucion._id), nombre: 'Colegio Ficticio Diagnóstico' }]);
  });

  it('detecta docentes y administradores borrados', async () => {
    const admin = await crearDocente({ institucionId: institucion._id });
    await Institucion.updateOne({ _id: institucion._id }, { adminId: admin._id });
    await User.deleteMany({ _id: { $in: [docente._id, admin._id] } });

    const resultado = await diagnosticarUsuariosHuerfanos();
    const porId = Object.fromEntries(resultado.map((r) => [r.usuarioId, r]));

    expect(porId[String(docente._id)].porCampo).toMatchObject({ 'cursos.docenteId': 1, 'tareas.docenteId': 1 });
    expect(porId[String(admin._id)].porCampo).toEqual({ 'institucions.adminId': 1 });
    expect(porId[String(admin._id)].instituciones[0].nombre).toBe('Colegio Ficticio Diagnóstico');
  });

  it('no modifica ninguna colección', async () => {
    await User.deleteOne({ _id: padre._id });
    const antes = await conteos();
    const cursoAntes = await Curso.findById(curso._id).lean();

    await diagnosticarUsuariosHuerfanos();

    expect(await conteos()).toEqual(antes);
    expect(await Curso.findById(curso._id).lean()).toEqual(cursoAntes);
  });
});
