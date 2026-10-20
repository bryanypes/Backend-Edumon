import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import AlertaRiesgo from '../../src/models/AlertaRiesgo.js';
import ConversacionIA from '../../src/models/ConversacionIA.js';
import Institucion from '../../src/models/Institucion.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { crearPadre, crearAdministrador, crearInstitucion } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const familiaYAdmin = async (app) => {
  const institucion = await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: institucion._id });
  await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
  const agent = await loginComo(app, await crearPadre({ institucionId: institucion._id }));
  await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
  const { body } = await agent.post('/api/ia/conversaciones');
  const url = `/api/ia/conversaciones/${body.conversacion._id}`;
  return { agent, url, conversacionId: body.conversacion._id, colegio: await loginComo(app, admin) };
};

// modo simulado: las reglas detectan el riesgo
describe('Ruta de atención en las alertas', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  it('alerta grave en el colegio: ámbito escolar, tipo III, visible en la lista y en la explicación', async () => {
    const { agent, url, conversacionId, colegio } = await familiaYAdmin(app);
    await agent.post(`${url}/mensajes`).send({ contenido: 'el profesor de música le tocó los senos a mi hija' });

    const { body } = await colegio.get('/api/ia/alertas');
    expect(body.alertas).toHaveLength(1);
    expect(body.alertas[0].rutaAtencion).toMatchObject({ ambito: 'escolar', tipoLey1620: 'III', pendienteValidacion: true });

    const explicacion = (await colegio.get(`/api/ia/alertas/${body.alertas[0]._id}/explicacion`)).body.explicacion;
    expect(explicacion.rutaAtencion.tipoLey1620).toBe('III');
    expect(explicacion.resumen).toMatch(/Ruta sugerida/);

    // también queda en el mensaje (para "¿Por qué Edumon dijo esto?")
    const conv = await ConversacionIA.findById(conversacionId).lean();
    expect(conv.mensajes[0].rutaAtencion).toMatchObject({ ambito: 'escolar', tipoLey1620: 'III' });
  });

  it('alerta grave en casa: ámbito hogar, sin tipo Ley 1620, protocolo de reporte', async () => {
    const { agent, url } = await familiaYAdmin(app);
    await agent.post(`${url}/mensajes`).send({ contenido: 'creo que abusaron de mi hija' });
    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.rutaAtencion).toMatchObject({ ambito: 'hogar', tipoLey1620: null });
    expect(alerta.rutaAtencion.fundamento[0]).toMatchObject({ norma: expect.stringMatching(/Ley 1098/), articulo: 'Art. 44, num. 9' });
  });

  it('riesgo suicida: ámbito personal y protocolo pendiente de fuente oficial', async () => {
    const { agent, url } = await familiaYAdmin(app);
    await agent.post(`${url}/mensajes`).send({ contenido: 'mi hija dice que se quiere morir' });
    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.rutaAtencion).toMatchObject({ ambito: 'personal', tipoLey1620: null });
    expect(alerta.rutaAtencion.fuentePendiente).toBeTruthy();
  });

  it('alerta pedida por la familia (moderado) también lleva ruta', async () => {
    const { agent, url } = await familiaYAdmin(app);
    await agent.post(`${url}/mensajes`).send({ contenido: 'a veces le pego con la chancla' });
    await agent.post(`${url}/ayuda`);
    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.origen).toBe('solicitada');
    expect(alerta.rutaAtencion).toMatchObject({ ambito: 'hogar', tipoLey1620: null });
    expect(alerta.rutaAtencion.protocolo).toMatch(/apoyo y orientación/);
  });

  it('un mensaje sin riesgo no lleva ruta', async () => {
    const { agent, url, conversacionId } = await familiaYAdmin(app);
    await agent.post(`${url}/mensajes`).send({ contenido: 'mi hijo no suelta el celular' });
    const conv = await ConversacionIA.findById(conversacionId).lean();
    expect(conv.mensajes[0].rutaAtencion).toBeNull();
  });
});
