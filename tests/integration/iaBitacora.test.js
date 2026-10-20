import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crearApp from '../../src/app.js';
import AlertaRiesgo from '../../src/models/AlertaRiesgo.js';
import Institucion from '../../src/models/Institucion.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { encadenarBitacoraPendiente } from '../../src/scripts/encadenarBitacora.js';
import { verificarCadena, encadenar, hashGenesis } from '../../src/services/ia/bitacora.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { crearPadre, crearDocente, crearAdministrador, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

// modo simulado: el mensaje grave lo detectan las reglas y crea la alerta
const conAlerta = async (app) => {
  const institucion = await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: institucion._id });
  await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
  const padre = await crearPadre({ institucionId: institucion._id });
  const familia = await loginComo(app, padre);
  await familia.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
  const { body } = await familia.post('/api/ia/conversaciones');
  await familia.post(`/api/ia/conversaciones/${body.conversacion._id}/mensajes`).send({ contenido: 'creo que abusaron de mi hija' });
  const alerta = await AlertaRiesgo.findOne({ institucionId: institucion._id }).lean();
  return { institucion, admin, padre, alerta, agent: await loginComo(app, admin) };
};

const integridad = (agent, alertaId) => agent.get(`/api/ia/alertas/${alertaId}/integridad`);

describe('Bitácora inmutable de alertas', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  it('cada evento queda encadenado con SHA-256 al anterior', async () => {
    const { agent, alerta } = await conAlerta(app);
    await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'en_atencion', notas: 'Llamé a la familia.' });
    await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ notas: 'Se activó la ruta con ICBF.' });
    await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'cerrada' });

    const guardada = await AlertaRiesgo.findById(alerta._id).lean();
    expect(guardada.historial.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(guardada.historial[0].hashAnterior).toBe(hashGenesis(guardada));
    for (let i = 1; i < guardada.historial.length; i += 1) {
      expect(guardada.historial[i].hashAnterior).toBe(guardada.historial[i - 1].hash);
      expect(guardada.historial[i].hash).toMatch(/^[0-9a-f]{64}$/);
    }

    const res = await integridad(agent, alerta._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valida: true, eventos: 4, rotaEn: null, estadoCoherente: true });
    expect(res.body.ultimoHash).toBe(guardada.historial[3].hash);
  });

  it('cambios simultáneos: nunca rompen la cadena (el que pierde recibe 409)', async () => {
    const { agent, alerta } = await conAlerta(app);
    const respuestas = await Promise.all([1, 2, 3, 4, 5].map((n) => agent
      .patch(`/api/ia/alertas/${alerta._id}`).send({ notas: `Nota simultánea ${n}.` })));

    expect(respuestas.every((r) => [200, 409].includes(r.status))).toBe(true);
    const exitosas = respuestas.filter((r) => r.status === 200).length;
    const res = await integridad(agent, alerta._id);
    expect(res.body.valida).toBe(true);
    expect(res.body.eventos).toBe(1 + exitosas);
    for (const r of respuestas.filter((x) => x.status === 409)) expect(r.body.code).toBe('ALERTA_MODIFICADA');
  });

  describe('detecta alteraciones hechas directo en la base de datos', () => {
    it('cambiar la nota de un evento: se rompe en ese evento', async () => {
      const { agent, alerta } = await conAlerta(app);
      await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'en_atencion', notas: 'Llamé a la familia.' });
      await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ notas: 'Se activó la ruta con ICBF.' });

      await AlertaRiesgo.collection.updateOne({ _id: alerta._id }, { $set: { 'historial.1.nota': 'No pasó nada.' } });

      const res = await integridad(agent, alerta._id);
      expect(res.body.valida).toBe(false);
      expect(res.body.rotaEn).toMatchObject({ indice: 1, accion: 'estado', motivo: 'hash_no_coincide' });
    });

    it('cambiar el mensaje que disparó la alerta: se rompe en el primer evento', async () => {
      const { agent, alerta } = await conAlerta(app);
      await AlertaRiesgo.collection.updateOne({ _id: alerta._id }, { $set: { mensajeDisparador: 'todo bien' } });

      const res = await integridad(agent, alerta._id);
      expect(res.body.valida).toBe(false);
      expect(res.body.rotaEn).toMatchObject({ indice: 0, motivo: 'enlace_roto' });
    });

    it('borrar un evento intermedio', async () => {
      const { agent, alerta } = await conAlerta(app);
      await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'en_atencion' });
      await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ notas: 'Nota uno.' });
      await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ notas: 'Nota dos.' });
      const guardada = await AlertaRiesgo.findById(alerta._id).lean();
      const sinUno = guardada.historial.filter((_, i) => i !== 2);
      await AlertaRiesgo.collection.updateOne({ _id: alerta._id }, { $set: { historial: sinUno } });

      const res = await integridad(agent, alerta._id);
      expect(res.body.valida).toBe(false);
      expect(res.body.rotaEn).toMatchObject({ indice: 2, motivo: 'secuencia' });
    });

    it('cambiar el estado sin pasar por la bitácora', async () => {
      const { agent, alerta } = await conAlerta(app);
      await AlertaRiesgo.collection.updateOne({ _id: alerta._id }, { $set: { estado: 'cerrada' } });

      const res = await integridad(agent, alerta._id);
      expect(res.body).toMatchObject({ valida: false, rotaEn: null, estadoCoherente: false });
    });

    it('reescribir un evento recalculando SU hash igual rompe el enlace del siguiente', async () => {
      const { agent, alerta } = await conAlerta(app);
      await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'en_atencion', notas: 'Original.' });
      await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ notas: 'Siguiente.' });
      const guardada = await AlertaRiesgo.findById(alerta._id).lean();
      // un atacante que conoce el algoritmo rehace el hash del evento 1
      const [falso] = encadenar(guardada, guardada.historial.slice(0, 1), [{ ...guardada.historial[1], nota: 'Falso.' }]);
      await AlertaRiesgo.collection.updateOne({ _id: alerta._id }, { $set: { 'historial.1': falso } });

      const res = await integridad(agent, alerta._id);
      expect(res.body.rotaEn).toMatchObject({ indice: 2, motivo: 'enlace_roto' });
    });
  });

  it('GET /api/ia/alertas/integridad resume todas las alertas visibles y señala las rotas', async () => {
    const { agent, alerta, institucion, padre } = await conAlerta(app);
    // segunda alerta de la misma institución (otra categoría)
    const familia = await loginComo(app, padre);
    const { body } = await familia.post('/api/ia/conversaciones');
    await familia.post(`/api/ia/conversaciones/${body.conversacion._id}/mensajes`).send({ contenido: 'mi hija dice que se quiere morir' });
    expect(await AlertaRiesgo.countDocuments({ institucionId: institucion._id })).toBe(2);

    let res = await agent.get('/api/ia/alertas/integridad');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valida: true, alertas: 2, eventos: 2, rotas: [] });

    await AlertaRiesgo.collection.updateOne({ _id: alerta._id }, { $set: { 'historial.0.nota': 'editada' } });
    res = await agent.get('/api/ia/alertas/integridad');
    expect(res.body.valida).toBe(false);
    expect(res.body.rotas).toHaveLength(1);
    expect(res.body.rotas[0]).toMatchObject({ alertaId: String(alerta._id), rotaEn: { indice: 0, motivo: 'hash_no_coincide' } });
  });

  describe('permisos', () => {
    it('sin sesión: 401', async () => {
      const { alerta } = await conAlerta(app);
      expect((await request(app).get(`/api/ia/alertas/${alerta._id}/integridad`)).status).toBe(401);
      expect((await request(app).get('/api/ia/alertas/integridad')).status).toBe(401);
    });

    it('una familia: 403', async () => {
      const { alerta, padre } = await conAlerta(app);
      const familia = await loginComo(app, padre);
      expect((await integridad(familia, alerta._id)).status).toBe(403);
      expect((await familia.get('/api/ia/alertas/integridad')).status).toBe(403);
    });

    it('admin de OTRA institución: 404 (no revela que existe)', async () => {
      const { alerta } = await conAlerta(app);
      const otra = await crearInstitucion();
      const ajeno = await loginComo(app, await crearAdministrador({ institucionId: otra._id }));
      expect((await integridad(ajeno, alerta._id)).status).toBe(404);
      expect((await ajeno.get('/api/ia/alertas/integridad')).body).toMatchObject({ alertas: 0 });
    });

    it('docente que no es responsable ni docente del curso de la familia: 404', async () => {
      const { alerta, institucion } = await conAlerta(app);
      const docente = await loginComo(app, await crearDocente({ institucionId: institucion._id }));
      expect((await integridad(docente, alerta._id)).status).toBe(404);
    });

    it('el responsable de convivencia sí puede verificar', async () => {
      const { alerta, institucion } = await conAlerta(app);
      const responsable = await crearDocente({ institucionId: institucion._id });
      await Institucion.findByIdAndUpdate(institucion._id, { responsableConvivenciaId: responsable._id });
      const res = await integridad(await loginComo(app, responsable), alerta._id);
      expect(res.status).toBe(200);
      expect(res.body.valida).toBe(true);
    });

    it('ID inválido: 400', async () => {
      const { agent } = await conAlerta(app);
      expect((await integridad(agent, 'no-es-un-id')).status).toBe(400);
    });
  });

  describe('backfill (npm run bitacora:encadenar)', () => {
    const alertaSinHashes = async (institucionId, usuarioId) => {
      const _id = new mongoose.Types.ObjectId();
      await AlertaRiesgo.collection.insertOne({
        _id, institucionId, usuarioId, categoria: 'abuso_sexual', origen: 'automatica',
        mensajeDisparador: 'mensaje anterior a la bitácora', estado: 'en_atencion',
        historial: [
          { accion: 'creada', estado: 'nueva', nota: 'Edumon detectó un posible riesgo grave.', por: null, en: new Date('2026-10-01T10:00:00Z') },
          { accion: 'estado', estado: 'en_atencion', nota: '', por: usuarioId, en: new Date('2026-10-02T10:00:00Z') },
        ],
        createdAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-02T10:00:00Z'),
      });
      return _id;
    };

    it('encadena las alertas viejas, es idempotente y no "arregla" cadenas manipuladas', async () => {
      const { alerta, institucion, admin } = await conAlerta(app);
      const vieja = await alertaSinHashes(institucion._id, admin._id);
      // una alerta ya encadenada y luego manipulada
      await AlertaRiesgo.collection.updateOne({ _id: alerta._id }, { $set: { 'historial.0.nota': 'editada' } });
      const manipuladaAntes = await AlertaRiesgo.findById(alerta._id).lean();

      const verificar = await encadenarBitacoraPendiente({ soloVerificar: true });
      expect(verificar).toMatchObject({ revisadas: 2, encadenadas: 1, yaEncadenadas: 1 });
      expect(verificarCadena(await AlertaRiesgo.findById(vieja).lean()).rotaEn.motivo).toBe('sin_hash');

      const primera = await encadenarBitacoraPendiente();
      expect(primera).toMatchObject({ revisadas: 2, encadenadas: 1, yaEncadenadas: 1 });
      expect(primera.rotas.map((r) => String(r.alertaId))).toEqual([String(alerta._id)]);
      expect(verificarCadena(await AlertaRiesgo.findById(vieja).lean())).toMatchObject({ valida: true, eventos: 2 });

      const segunda = await encadenarBitacoraPendiente();
      expect(segunda).toMatchObject({ encadenadas: 0, yaEncadenadas: 2 });

      // la manipulada sigue tal cual (no se recalculó) y sigue reportándose rota
      expect(await AlertaRiesgo.findById(alerta._id).lean()).toEqual(manipuladaAntes);
      expect(segunda.rotas).toHaveLength(1);
    });

    it('una alerta vieja encadenada sigue funcionando al actualizarla por la API', async () => {
      const { institucion, admin, agent } = await conAlerta(app);
      const vieja = await alertaSinHashes(institucion._id, admin._id);
      await encadenarBitacoraPendiente();

      await agent.patch(`/api/ia/alertas/${vieja}`).send({ estado: 'cerrada' });
      expect((await integridad(agent, vieja)).body).toMatchObject({ valida: true, eventos: 3 });
    });
  });
});
