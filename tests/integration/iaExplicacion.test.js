import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crearApp from '../../src/app.js';
import AlertaRiesgo from '../../src/models/AlertaRiesgo.js';
import Institucion from '../../src/models/Institucion.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { _reiniciarEstadoIA } from '../../src/services/ia/proveedorIA.js';
import { _limpiarCacheClasificaciones } from '../../src/services/ia/clasificador.js';
import { crearPadre, crearDocente, crearAdministrador, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';
import {
  stubProveedores, configurarLlaves, guardarEntorno, respuestaOk, RESPUESTA_EDUMON,
} from '../helpers/proveedoresFalsos.js';

const prepararFamilia = async (app, institucion) => {
  const inst = institucion ?? await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: inst._id });
  await Institucion.findByIdAndUpdate(inst._id, { adminId: admin._id });
  const padre = await crearPadre({ institucionId: inst._id });
  const agent = await loginComo(app, padre);
  await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
  const { body } = await agent.post('/api/ia/conversaciones');
  const conversacionId = body.conversacion._id;
  const enviar = (contenido) => agent.post(`/api/ia/conversaciones/${conversacionId}/mensajes`).send({ contenido });
  const explicar = (mensajeId) => agent.get(`/api/ia/conversaciones/${conversacionId}/mensajes/${mensajeId}/explicacion`);
  return { institucion: inst, admin, padre, agent, conversacionId, enviar, explicar };
};

// clasificación que devuelve el "modelo" falso
const clasificacionLLM = (extra) => ({
  nivelRiesgo: 'riesgo', gravedad: 'grave', categoriaRiesgo: 'autolesion_suicidio',
  eje: 'crianza_amorosa', subtema: 'emociones', edad: null, pideResolverTarea: false, ...extra,
});
const conModelo = (clasificacion) => stubProveedores({
  openai: (body) => respuestaOk(body.response_format.json_schema.name === 'clasificacion_edumon' ? clasificacion : RESPUESTA_EDUMON),
});

describe('"¿Por qué Edumon dijo esto?"', () => {
  let app;
  let restaurar;
  beforeEach(async () => {
    restaurar = guardarEntorno();
    _reiniciarEstadoIA();
    _limpiarCacheClasificaciones();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ app } = crearApp());
    await cargarFichas();
  });
  afterEach(() => { restaurar(); vi.restoreAllMocks(); });

  describe('explicación de un mensaje (familia)', () => {
    it('respuesta normal: fichas usadas, fuentes, quién decidió y modo', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { enviar, explicar } = await prepararFamilia(app);
      const { body } = await enviar('mi hija de 4 años hace rabietas terribles');

      const res = await explicar(body.respuesta._id);
      expect(res.status).toBe(200);
      const e = res.body.explicacion;
      expect(e).toMatchObject({
        mensajeId: body.mensajeUsuario._id,
        respuestaId: body.respuesta._id,
        nivelRiesgo: 'normal',
        riesgo: null,
        decidio: 'regla',
        seNotificoAlColegio: false,
        respuesta: { tipo: 'respuesta', modo: 'simulado', esTextoFijo: false },
        clasificacion: { fuente: 'reglas', proveedor: null },
      });
      expect(e.fichas).toHaveLength(1);
      expect(e.fichas[0]).toMatchObject({ _id: String(body.respuesta.fichasIds[0]), titulo: expect.any(String), subtema: 'rabietas' });
      expect(e.fichas[0].fuente.nombre).toBeTruthy();
      expect(e.fuentes).toEqual(body.respuesta.fuentes);
      expect(e.resumen).toMatch(/Fichas usadas/);
    });

    it('pedir la explicación con el id del mensaje del cuidador da la misma explicación', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { enviar, explicar } = await prepararFamilia(app);
      const { body } = await enviar('mi hija de 4 años hace rabietas terribles');
      const porRespuesta = (await explicar(body.respuesta._id)).body.explicacion;
      const porMensaje = (await explicar(body.mensajeUsuario._id)).body.explicacion;
      expect(porMensaje).toEqual(porRespuesta);
    });

    it('riesgo grave detectado por una regla: fragmento, aviso al colegio y texto fijo', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { enviar, explicar } = await prepararFamilia(app);
      const { body } = await enviar('mi hija dice que se quiere morir');

      const e = (await explicar(body.respuesta._id)).body.explicacion;
      expect(e).toMatchObject({
        nivelRiesgo: 'riesgo',
        riesgo: { categoria: 'autolesion_suicidio', gravedad: 'grave', etiqueta: 'riesgo de autolesión o suicidio' },
        decidio: 'regla',
        seNotificoAlColegio: true,
        respuesta: { tipo: 'riesgo', modo: 'plantilla', esTextoFijo: true },
        fichas: [],
      });
      expect(e.clasificacion.reglaSegura).toMatchObject({ categoria: 'autolesion_suicidio', fragmento: expect.stringMatching(/quiere morir/) });
      expect(e.resumen).toMatch(/regla de seguridad/);
    });

    it('riesgo que solo vio el modelo: decidió "modelo", con proveedor y modelo', async () => {
      configurarLlaves({ groq: false });
      conModelo(clasificacionLLM());
      const { enviar, explicar } = await prepararFamilia(app);
      const { body } = await enviar('dice que todos estarian mejor sin el');

      const e = (await explicar(body.respuesta._id)).body.explicacion;
      expect(e).toMatchObject({
        nivelRiesgo: 'riesgo',
        decidio: 'modelo',
        clasificacion: {
          fuente: 'ia', proveedor: 'openai', modelo: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          reglaSegura: null, modeloDijo: { nivelRiesgo: 'riesgo', gravedad: 'grave', categoria: 'autolesion_suicidio' },
        },
      });
    });

    it('indicio dudoso de la regla confirmado por el modelo: decidieron "ambos"', async () => {
      configurarLlaves({ groq: false });
      conModelo(clasificacionLLM());
      const { enviar, explicar } = await prepararFamilia(app);
      const { body } = await enviar('encontré una carta de despedida de mi hijo');

      const e = (await explicar(body.mensajeUsuario._id)).body.explicacion;
      expect(e.decidio).toBe('ambos');
      expect(e.clasificacion.reglaDudosa).toMatchObject({ categoria: 'autolesion_suicidio', fragmento: expect.stringMatching(/carta de despedida/) });
    });

    it('respuesta redactada por un modelo: proveedor, modelo y latencia', async () => {
      configurarLlaves({ groq: false });
      conModelo(clasificacionLLM({ nivelRiesgo: 'normal', gravedad: 'ninguna', categoriaRiesgo: 'ninguna', subtema: 'rabietas', edad: 4 }));
      const { enviar, explicar } = await prepararFamilia(app);
      const { body } = await enviar('mi hija de 4 años hace rabietas terribles');

      const e = (await explicar(body.respuesta._id)).body.explicacion;
      expect(e.decidio).toBe('modelo');
      expect(e.respuesta).toMatchObject({ modo: 'llm', proveedor: 'openai', huboFallback: false });
      expect(e.respuesta.latenciaMs).toBeGreaterThanOrEqual(0);
      expect(e.fichas.length).toBeGreaterThan(0);
    });

    describe('permisos', () => {
      it('otra familia no puede ver la explicación (404)', async () => {
        configurarLlaves({ groq: false, openai: false });
        const a = await prepararFamilia(app);
        const { body } = await a.enviar('mi hija de 4 años hace rabietas terribles');
        const b = await prepararFamilia(app);
        const res = await b.agent.get(`/api/ia/conversaciones/${a.conversacionId}/mensajes/${body.respuesta._id}/explicacion`);
        expect(res.status).toBe(404);
      });

      it('un docente o un administrador no pueden leer conversaciones (403)', async () => {
        configurarLlaves({ groq: false, openai: false });
        const a = await prepararFamilia(app);
        const { body } = await a.enviar('hola');
        const url = `/api/ia/conversaciones/${a.conversacionId}/mensajes/${body.respuesta._id}/explicacion`;
        expect((await (await loginComo(app, a.admin)).get(url)).status).toBe(403);
        expect((await (await loginComo(app, await crearDocente({ institucionId: a.institucion._id }))).get(url)).status).toBe(403);
        expect((await request(app).get(url)).status).toBe(401);
      });

      it('IDs inválidos (400) y mensaje que no es de la conversación (404)', async () => {
        configurarLlaves({ groq: false, openai: false });
        const { explicar, agent, conversacionId } = await prepararFamilia(app);
        expect((await explicar('no-es-id')).status).toBe(400);
        expect((await explicar(new mongoose.Types.ObjectId())).status).toBe(404);
        expect((await agent.get(`/api/ia/conversaciones/abc/mensajes/${new mongoose.Types.ObjectId()}/explicacion`)).status).toBe(400);
        expect(conversacionId).toBeTruthy();
      });
    });
  });

  describe('explicación de una alerta (colegio)', () => {
    it('el admin ve por qué se generó la alerta', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { enviar, admin } = await prepararFamilia(app);
      await enviar('creo que abusaron de mi hija');
      const alerta = await AlertaRiesgo.findOne().lean();

      const res = await (await loginComo(app, admin)).get(`/api/ia/alertas/${alerta._id}/explicacion`);
      expect(res.status).toBe(200);
      expect(res.body.explicacion).toMatchObject({
        origen: 'automatica', categoria: 'abuso_sexual', etiqueta: 'abuso sexual', decidio: 'regla',
        mensajeDisparador: 'creo que abusaron de mi hija',
        clasificacion: { fuente: 'reglas', reglaSegura: { fragmento: expect.stringMatching(/abusaron de mi hija/) } },
      });
    });

    it('alerta pedida por la familia: decidió "familia"', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { enviar, agent, conversacionId, admin } = await prepararFamilia(app);
      await enviar('a veces le pego con la chancla');
      await agent.post(`/api/ia/conversaciones/${conversacionId}/ayuda`);
      const alerta = await AlertaRiesgo.findOne().lean();
      const res = await (await loginComo(app, admin)).get(`/api/ia/alertas/${alerta._id}/explicacion`);
      expect(res.body.explicacion).toMatchObject({ origen: 'solicitada', decidio: 'familia' });
    });

    it('familia (403), admin de otra institución (404), sin sesión (401)', async () => {
      configurarLlaves({ groq: false, openai: false });
      const { enviar, agent } = await prepararFamilia(app);
      await enviar('creo que abusaron de mi hija');
      const alerta = await AlertaRiesgo.findOne().lean();
      const url = `/api/ia/alertas/${alerta._id}/explicacion`;

      expect((await agent.get(url)).status).toBe(403);
      const otra = await crearInstitucion();
      expect((await (await loginComo(app, await crearAdministrador({ institucionId: otra._id }))).get(url)).status).toBe(404);
      expect((await request(app).get(url)).status).toBe(401);
    });
  });
});
