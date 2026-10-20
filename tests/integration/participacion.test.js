import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Evento from '../../src/models/Evento.js';
import AsistenciaEncuentro from '../../src/models/AsistenciaEncuentro.js';
import LineamientoEscuelaPadres from '../../src/models/LineamientoEscuelaPadres.js';
import {
  crearInstitucion, crearAdministrador, crearDocente, crearPadre, crearCurso, crearModulo, crearTarea, crearEntrega, crearEvento,
} from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

// grupo con 3 familias, un reto de escuela de padres y un encuentro ya realizado
const escenario = async (app) => {
  const institucion = await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: institucion._id });
  const docente = await crearDocente({ institucionId: institucion._id });
  const otroDocente = await crearDocente({ institucionId: institucion._id });
  const [f1, f2, f3] = await Promise.all([1, 2, 3].map(() => crearPadre({ institucionId: null })));
  const curso = await crearCurso({
    institucionId: institucion._id, docenteId: docente._id, nombre: 'Grado Quinto',
    participantes: [{ usuarioId: docente._id, etiqueta: 'docente' }, ...[f1, f2, f3].map((f) => ({ usuarioId: f._id, etiqueta: 'padre' }))],
  });
  const modulo = await crearModulo({ cursoId: curso._id });
  const reto = await crearTarea({
    cursoId: curso._id, moduloId: modulo._id, docenteId: docente._id,
    escuelaPadres: { eje: 'crianza_amorosa', subtema: 'rabietas', tema: 'Rabietas' },
  });
  const encuentro = await crearEvento({ cursosIds: [curso._id], docenteId: docente._id, categoria: 'escuela_padres' });
  // ya ocurrió (el modelo no deja crear eventos en el pasado)
  await Evento.updateOne({ _id: encuentro._id }, { fechaInicio: new Date(Date.now() - 2 * 3600e3), fechaFin: new Date(Date.now() - 3600e3) });
  return {
    institucion, admin, docente, otroDocente, familias: [f1, f2, f3], curso, reto, encuentro,
    agentDocente: await loginComo(app, docente),
    agentAdmin: await loginComo(app, admin),
  };
};

describe('Asistencia a encuentros de escuela de padres', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('el docente ve la lista de familias de su grupo, sin marcar', async () => {
    const { agentDocente, encuentro } = await escenario(app);
    const res = await agentDocente.get(`/api/eventos/${encuentro._id}/asistencia`);
    expect(res.status).toBe(200);
    expect(res.body.grupos[0].familias).toHaveLength(3);
    expect(res.body.resumen).toEqual({ familias: 3, asistieron: 0, sinMarcar: 3 });
  });

  it('marca asistencia, guarda quién marcó y el historial de correcciones', async () => {
    const { agentDocente, encuentro, familias, docente } = await escenario(app);
    const url = `/api/eventos/${encuentro._id}/asistencia`;

    const res = await agentDocente.put(url).send({ registros: [
      { usuarioId: familias[0]._id, asistio: true, modalidad: 'presencial' },
      { usuarioId: familias[1]._id, asistio: true, modalidad: 'virtual' },
      { usuarioId: familias[2]._id, asistio: false },
    ] });
    expect(res.status).toBe(200);
    expect(res.body.resumen).toEqual({ familias: 3, asistieron: 2, sinMarcar: 0 });
    expect(res.body.cambios).toBe(3);

    // corrección: la familia 3 sí asistió (virtual); repetir lo mismo no cuenta como cambio
    const corr = await agentDocente.put(url).send({ registros: [
      { usuarioId: familias[2]._id, asistio: true, modalidad: 'virtual' },
      { usuarioId: familias[0]._id, asistio: true, modalidad: 'presencial' },
    ] });
    expect(corr.body.cambios).toBe(1);

    const registro = await AsistenciaEncuentro.findOne({ usuarioId: familias[2]._id }).lean();
    expect(registro.historial.map((h) => h.asistio)).toEqual([false, true]);
    expect(String(registro.marcadoPor)).toBe(String(docente._id));
  });

  it('otro docente sin grupos en el encuentro no puede marcar', async () => {
    const { otroDocente, encuentro, familias } = await escenario(app);
    const agent = await loginComo(app, otroDocente);
    const res = await agent.put(`/api/eventos/${encuentro._id}/asistencia`).send({ registros: [{ usuarioId: familias[0]._id, asistio: true }] });
    expect(res.status).toBe(403);
  });

  it('no deja marcar familias ajenas, encuentros futuros ni eventos que no son de escuela de padres', async () => {
    const { agentDocente, encuentro, curso, docente } = await escenario(app);
    const ajena = await crearPadre();
    expect((await agentDocente.put(`/api/eventos/${encuentro._id}/asistencia`).send({ registros: [{ usuarioId: ajena._id, asistio: true }] })).status).toBe(400);

    const futuro = await crearEvento({ cursosIds: [curso._id], docenteId: docente._id, categoria: 'escuela_padres' });
    const resFuturo = await agentDocente.put(`/api/eventos/${futuro._id}/asistencia`).send({ registros: [{ usuarioId: (await crearPadre())._id, asistio: true }] });
    expect(resFuturo.status).toBe(400);

    const institucional = await crearEvento({ cursosIds: [curso._id], docenteId: docente._id });
    expect((await agentDocente.get(`/api/eventos/${institucional._id}/asistencia`)).status).toBe(400);
  });

  it('un padre no puede ver ni marcar asistencia', async () => {
    const { encuentro, familias } = await escenario(app);
    const agent = await loginComo(app, familias[0]);
    expect((await agent.get(`/api/eventos/${encuentro._id}/asistencia`)).status).toBe(403);
  });
});

describe('Participación por grado (trazabilidad)', () => {
  let app;
  beforeEach(() => { ({ app } = crearApp()); });

  it('cuenta familias que entregaron un reto o asistieron, y los encuentros frente a la meta', async () => {
    const { agentAdmin, agentDocente, encuentro, familias, reto, curso } = await escenario(app);
    await LineamientoEscuelaPadres.create({ institucionId: curso.institucionId, publicado: { objetivo: 'x', encuentrosPorAnio: 3 }, version: 1 });

    // familia 1 entregó el reto; familia 2 asistió; familia 3 solo dejó un borrador (no cuenta)
    await crearEntrega({ tareaId: reto._id, padreId: familias[0]._id, estado: 'enviada' });
    await crearEntrega({ tareaId: reto._id, padreId: familias[2]._id, estado: 'borrador' });
    await agentDocente.put(`/api/eventos/${encuentro._id}/asistencia`).send({ registros: [
      { usuarioId: familias[1]._id, asistio: true }, { usuarioId: familias[2]._id, asistio: false },
    ] });

    const res = await agentAdmin.get('/api/ia/lineamientos/seguimiento');
    const quinto = res.body.cursos.find((c) => c.cursoId === String(curso._id));
    expect(quinto.participacion).toEqual({ familias: 3, entregaron: 1, asistieron: 1, participaron: 2, porcentaje: 67 });
    expect(quinto.encuentros).toMatchObject({ meta: 3, realizados: 1, programados: 0, sinAsistenciaMarcada: 0 });

    // detalle nominal por familia
    const det = await agentDocente.get(`/api/ia/lineamientos/seguimiento/${curso._id}`);
    expect(det.status).toBe(200);
    const porNombre = Object.fromEntries(det.body.familias.map((f) => [String(f.usuarioId), f]));
    expect(porNombre[String(familias[0]._id)]).toMatchObject({ participo: true });
    expect(porNombre[String(familias[0]._id)].retos[0].entregadoEn).toBeTruthy();
    expect(porNombre[String(familias[1]._id)].encuentros[0]).toMatchObject({ asistio: true, modalidad: 'presencial' });
    expect(porNombre[String(familias[2]._id)]).toMatchObject({ participo: false });
    expect(det.body.encuentros[0]).toMatchObject({ realizado: true, asistenciaMarcada: true });
  });

  it('avisa los encuentros realizados sin asistencia marcada', async () => {
    const { agentAdmin, curso } = await escenario(app);
    const res = await agentAdmin.get('/api/ia/lineamientos/seguimiento');
    const quinto = res.body.cursos.find((c) => c.cursoId === String(curso._id));
    expect(quinto.encuentros.sinAsistenciaMarcada).toBe(1);
  });

  it('el detalle de un grupo ajeno da 404 al docente', async () => {
    const { otroDocente, curso } = await escenario(app);
    const agent = await loginComo(app, otroDocente);
    expect((await agent.get(`/api/ia/lineamientos/seguimiento/${curso._id}`)).status).toBe(404);
  });
});
