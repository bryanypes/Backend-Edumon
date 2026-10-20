import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import AlertaRiesgo from '../../src/models/AlertaRiesgo.js';
import ConversacionIA from '../../src/models/ConversacionIA.js';
import Notificacion from '../../src/models/Notificacion.js';
import Institucion from '../../src/models/Institucion.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import { crearPadre, crearDocente, crearAdministrador, crearInstitucion, crearCurso } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

// GROQ_API_KEY está vacía en los tests: todo corre en modo simulado (reglas + fichas)

const prepararFamilia = async (app) => {
  const institucion = await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: institucion._id });
  await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
  const padre = await crearPadre({ institucionId: institucion._id });
  const agent = await loginComo(app, padre);
  await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
  const { body } = await agent.post('/api/ia/conversaciones');
  return { institucion, admin, padre, agent, conversacionId: body.conversacion._id };
};

describe('Chat con Edumon (modo simulado)', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  it('pide la edad una vez y luego responde con una ficha, práctica y fuente', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const url = `/api/ia/conversaciones/${conversacionId}/mensajes`;

    const primera = await agent.post(url).send({ contenido: 'mi hijo no suelta el celular' });
    expect(primera.status).toBe(201);
    expect(primera.body.respuesta.contenido).toMatch(/qué edad/i);
    expect(primera.body.respuesta.tipo).toBe('pedir_edad');

    const segunda = await agent.post(url).send({ contenido: 'tiene 9 años' });
    expect(segunda.body.conversacion.edadHijo).toBe(9);
    expect(segunda.body.conversacion.titulo).toBe('Pantallas y celular');
    expect(segunda.body.respuesta.practica).toBeTruthy();
    expect(segunda.body.respuesta.tipo).toBe('respuesta');
    expect(segunda.body.respuesta.fuentes.length).toBeGreaterThan(0);
    expect(segunda.body.respuesta.fichasIds).toHaveLength(1);
  });

  it('si la edad viene en el primer mensaje responde de una vez', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hija de 4 años hace rabietas terribles' });

    expect(res.body.respuesta.practica).toBeTruthy();
    expect(res.body.conversacion.edadHijo).toBe(4);
  });

  it('respuesta normal: recomienda videos o artículos con enlaces de búsqueda reales', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hija de 4 años hace rabietas terribles' });

    expect(res.body.respuesta.recursos.length).toBeGreaterThan(0);
    for (const r of res.body.respuesta.recursos) {
      expect(r.url).toMatch(/^https:\/\/(www\.youtube\.com\/results|www\.google\.com\/search)\?/);
    }
  });

  it.each([
    'resuélveme este ejercicio de física',
    'cuánto es 125 x 8',
    'hazme la tarea de matemáticas',
  ])('no hace tareas académicas: "%s"', async (contenido) => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent.post(`/api/ia/conversaciones/${conversacionId}/mensajes`).send({ contenido });

    expect(res.body.respuesta.tipo).toBe('no_tareas');
    expect(res.body.respuesta.contenido).toMatch(/no resuelvo tareas/i);
    expect(await AlertaRiesgo.countDocuments()).toBe(0);
  });

  it('pedir ayuda para acompañar las tareas sí es su tema', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hijo de 9 años no quiere hacer la tarea, qué hago' });

    expect(res.body.respuesta.tipo).toBe('respuesta');
  });

  it('fuera de alcance no inventa: lo dice y no cita fichas', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'qué opinas de la política' });

    expect(res.body.respuesta.contenido).toMatch(/no tengo información confiable/i);
    expect(res.body.respuesta.tipo).toBe('fuera_alcance');
    expect(res.body.respuesta.fichasIds).toHaveLength(0);
  });

  it('atención: responde normal y agrega la nota de apoyo, sin alerta', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hijo de 7 años no me hace caso y ya no puedo más' });

    expect(res.body.mensajeUsuario.nivelRiesgo).toBe('atencion');
    expect(res.body.respuesta.contenido).toMatch(/192/);
    expect(res.body.respuesta.atencion).toBe(true);
    expect(await AlertaRiesgo.countDocuments()).toBe(0);
  });

  it('nivel 2 (castigo físico sin lesiones): ofrece ayuda pero NO avisa a nadie', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hijo de 7 años no hace caso y le pego con la chancla' });

    expect(res.body.mensajeUsuario.nivelRiesgo).toBe('riesgo_moderado');
    expect(res.body.respuesta.esRespuestaRiesgo).toBe(false);
    expect(res.body.respuesta.ofrecerAyuda).toMatchObject({ categoria: 'maltrato_fisico', solicitada: false });
    expect(res.body.respuesta.contenido).toMatch(/solo les avisaré si tú me lo pides/);
    expect(await AlertaRiesgo.countDocuments()).toBe(0);
    expect(await Notificacion.countDocuments({ tipo: 'alerta_ia' })).toBe(0);
  });

  it('nivel 2: si la familia pide ayuda, se crea la alerta "solicitada" una sola vez', async () => {
    const { agent, conversacionId, admin } = await prepararFamilia(app);
    await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hijo de 7 años no hace caso y le pego con la chancla' });

    const res = await agent.post(`/api/ia/conversaciones/${conversacionId}/ayuda`);
    expect(res.status).toBe(201);
    expect(res.body.mensaje.contenido).toMatch(/te van a contactar/);

    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta).toMatchObject({ categoria: 'maltrato_fisico', origen: 'solicitada' });
    expect(alerta.mensajeDisparador).toMatch(/chancla/);
    const aviso = await Notificacion.findOne({ usuarioId: admin._id, tipo: 'alerta_ia' }).lean();
    expect(aviso.mensaje).toMatch(/pidió apoyo/);

    // pedirla otra vez no duplica
    expect((await agent.post(`/api/ia/conversaciones/${conversacionId}/ayuda`)).status).toBe(409);
    expect(await AlertaRiesgo.countDocuments()).toBe(1);
  });

  it('nivel 2 sin tema de crianza (violencia de pareja): apoyo, líneas y oferta de ayuda', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi esposo me pega y tengo miedo' });

    expect(res.body.respuesta.tipo).toBe('apoyo');
    expect(res.body.respuesta.contenido).toMatch(/155/);
    expect(res.body.respuesta.ofrecerAyuda).toBeTruthy();
    expect(await AlertaRiesgo.countDocuments()).toBe(0);
  });

  it('sin oferta pendiente, pedir ayuda responde 409', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    expect((await agent.post(`/api/ia/conversaciones/${conversacionId}/ayuda`)).status).toBe(409);
  });

  it('riesgo: respuesta fija, alerta al admin y notificación sin el nombre de la familia', async () => {
    const { agent, conversacionId, admin, padre } = await prepararFamilia(app);
    const res = await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hija dice que se quiere morir' });

    expect(res.body.mensajeUsuario.nivelRiesgo).toBe('riesgo');
    expect(res.body.respuesta.esRespuestaRiesgo).toBe(true);
    expect(res.body.respuesta.contenido).toMatch(/141/);
    expect(res.body.respuesta.tipo).toBe('riesgo');
    expect(res.body.respuesta.practica).toBeNull();
    expect(res.body.conversacion.titulo).toBe('Necesito apoyo');

    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.categoria).toBe('autolesion_suicidio');
    expect(alerta.notificadoA.toString()).toBe(admin._id.toString());

    const notificacion = await Notificacion.findOne({ usuarioId: admin._id, tipo: 'alerta_ia' }).lean();
    expect(notificacion).toBeTruthy();
    expect(notificacion.mensaje).not.toContain(padre.apellido);
  });

  it('riesgo: la alerta va al responsable de convivencia si está designado', async () => {
    const { agent, conversacionId, institucion } = await prepararFamilia(app);
    const responsable = await crearDocente({ institucionId: institucion._id });
    await Institucion.findByIdAndUpdate(institucion._id, { responsableConvivenciaId: responsable._id });

    await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi esposo me amenaza con matar a todos' });

    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.origen).toBe('automatica');
    expect(alerta.notificadoA.toString()).toBe(responsable._id.toString());
  });

  it('riesgo repetido en la misma conversación no duplica la alerta', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const url = `/api/ia/conversaciones/${conversacionId}/mensajes`;
    await agent.post(url).send({ contenido: 'mi hijo se quiere matar' });
    await agent.post(url).send({ contenido: 'de verdad dice que se quiere matar' });

    expect(await AlertaRiesgo.countDocuments()).toBe(1);
  });

  it.each([
    'mi hijo está abusando de los videojuegos',
    'se fracturó el brazo jugando fútbol',
    'mi hija se corta el pelo sola',
    '¿cómo le explico a mi hija de 4 años lo de las partes íntimas?',
  ])('frases cotidianas no generan alerta ni oferta de ayuda: "%s"', async (contenido) => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent.post(`/api/ia/conversaciones/${conversacionId}/mensajes`).send({ contenido });

    expect(res.body.respuesta.tipo).not.toBe('riesgo');
    expect(res.body.respuesta.ofrecerAyuda).toBeFalsy();
    expect(await AlertaRiesgo.countDocuments()).toBe(0);
  });

  it.each([
    ['mis hijos de 6 y 9 pelean todo el tiempo', 'Hermanos y celos'],
    ['¿cómo organizo las mañanas antes del colegio? tiene 7 años', 'Rutinas y organización'],
    ['¿cómo hablo con el docente de mi hijo de 10 años sobre un problema?', 'Relación con el colegio'],
    ['nos separamos y mi hija de 7 llora mucho', 'Separación, duelo y cambios'],
  ])('temas nuevos tienen fichas: "%s"', async (contenido, titulo) => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const res = await agent.post(`/api/ia/conversaciones/${conversacionId}/mensajes`).send({ contenido });

    expect(res.body.respuesta.tipo).toBe('respuesta');
    expect(res.body.conversacion.titulo).toBe(titulo);
  });

  it('saludos y agradecimientos se responden como charla, no como "fuera de alcance"', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const url = `/api/ia/conversaciones/${conversacionId}/mensajes`;

    const hola = await agent.post(url).send({ contenido: 'hola' });
    expect(hola.body.respuesta.tipo).toBe('charla');
    const gracias = await agent.post(url).send({ contenido: 'muchas gracias' });
    expect(gracias.body.respuesta.tipo).toBe('charla');
    expect(gracias.body.respuesta.contenido).not.toMatch(/no tengo información confiable/i);
  });

  it('en un seguimiento usa otra ficha del mismo tema', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const url = `/api/ia/conversaciones/${conversacionId}/mensajes`;

    const primera = await agent.post(url).send({ contenido: 'mi hija de 15 años no respeta las normas de la casa' });
    const segunda = await agent.post(url).send({ contenido: 'ya lo intenté y no funciona' });
    expect(segunda.body.respuesta.tipo).toBe('respuesta');
    expect(segunda.body.respuesta.fichasIds[0]).not.toBe(primera.body.respuesta.fichasIds[0]);
  });

  it('la edad se pide una sola vez por conversación', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const url = `/api/ia/conversaciones/${conversacionId}/mensajes`;

    expect((await agent.post(url).send({ contenido: 'no come casi nada' })).body.respuesta.tipo).toBe('pedir_edad');
    // no dio la edad: sigue con ideas generales y no la vuelve a pedir, ni en otro tema
    expect((await agent.post(url).send({ contenido: 'me preocupa mucho' })).body.respuesta.tipo).toBe('respuesta');
    expect((await agent.post(url).send({ contenido: 'le cuesta dormirse' })).body.respuesta.tipo).toBe('respuesta');
  });

  it('rechaza mensajes vacíos o demasiado largos', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    const url = `/api/ia/conversaciones/${conversacionId}/mensajes`;

    expect((await agent.post(url).send({ contenido: '   ' })).status).toBe(400);
    expect((await agent.post(url).send({ contenido: 'a'.repeat(2001) })).status).toBe(400);
  });

  it('no deja escribir en la conversación de otra familia', async () => {
    const { conversacionId } = await prepararFamilia(app);
    const { agent: otraFamilia } = await prepararFamilia(app);

    const res = await otraFamilia
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'hola' });
    expect(res.status).toBe(404);
  });

  it('GET de una conversación propia devuelve los mensajes', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    await agent
      .post(`/api/ia/conversaciones/${conversacionId}/mensajes`)
      .send({ contenido: 'mi hija de 4 años hace rabietas' });

    const res = await agent.get(`/api/ia/conversaciones/${conversacionId}`);
    expect(res.status).toBe(200);
    expect(res.body.conversacion.mensajes).toHaveLength(2);
  });
});

describe('Familias sin institución propia (caso real: el padre solo está en cursos)', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  it('la alerta grave llega al docente del curso aunque el padre no tenga institucionId', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
    const docente = await crearDocente({ institucionId: institucion._id });
    const padre = await crearPadre({ institucionId: null });
    await crearCurso({
      institucionId: institucion._id,
      docenteId: docente._id,
      participantes: [{ usuarioId: docente._id, etiqueta: 'docente' }, { usuarioId: padre._id, etiqueta: 'padre' }],
    });

    const familia = await loginComo(app, padre);
    await familia.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    const { body } = await familia.post('/api/ia/conversaciones');
    expect(body.conversacion.institucionId).toBe(institucion._id.toString());
    await familia.post(`/api/ia/conversaciones/${body.conversacion._id}/mensajes`).send({ contenido: 'creo que abusaron de mi hija' });

    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.institucionId.toString()).toBe(institucion._id.toString());
    expect(alerta.docentesCurso.map(String)).toEqual([docente._id.toString()]);

    const agent = await loginComo(app, docente);
    const res = await agent.get('/api/ia/alertas');
    expect(res.body.alertas).toHaveLength(1);
    expect(await Notificacion.countDocuments({ usuarioId: docente._id, tipo: 'alerta_ia' })).toBe(1);
  });
});

describe('Bandeja de alertas de riesgo', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  const conAlerta = async () => {
    const datos = await prepararFamilia(app);
    await datos.agent
      .post(`/api/ia/conversaciones/${datos.conversacionId}/mensajes`)
      .send({ contenido: 'creo que abusaron de mi hija' });
    return datos;
  };

  it('el admin ve las alertas de su institución con los datos de la familia', async () => {
    const { admin, padre } = await conAlerta();
    const agent = await loginComo(app, admin);

    const res = await agent.get('/api/ia/alertas');
    expect(res.status).toBe(200);
    expect(res.body.alertas).toHaveLength(1);
    expect(res.body.alertas[0].usuarioId.telefono).toBe(padre.telefono);
  });

  it('el admin de otra institución no las ve', async () => {
    await conAlerta();
    const otra = await crearInstitucion();
    const otroAdmin = await crearAdministrador({ institucionId: otra._id });
    const agent = await loginComo(app, otroAdmin);

    const res = await agent.get('/api/ia/alertas');
    expect(res.body.alertas).toHaveLength(0);
  });

  it('un docente que no tiene a esa familia en sus cursos no ve la alerta', async () => {
    const { institucion } = await conAlerta();
    const docente = await crearDocente({ institucionId: institucion._id });
    const agent = await loginComo(app, docente);
    const alerta = await AlertaRiesgo.findOne().lean();

    expect((await agent.get('/api/ia/alertas')).body.alertas).toHaveLength(0);
    expect((await agent.get(`/api/ia/alertas/${alerta._id}`)).status).toBe(404);
  });

  it('el docente del curso de esa familia recibe la notificación y ve la alerta', async () => {
    const institucion = await crearInstitucion();
    const admin = await crearAdministrador({ institucionId: institucion._id });
    await Institucion.findByIdAndUpdate(institucion._id, { adminId: admin._id });
    const docente = await crearDocente({ institucionId: institucion._id });
    const padre = await crearPadre({ institucionId: institucion._id });
    await crearCurso({
      institucionId: institucion._id,
      docenteId: docente._id,
      participantes: [{ usuarioId: docente._id, etiqueta: 'docente' }, { usuarioId: padre._id, etiqueta: 'padre' }],
    });

    const familia = await loginComo(app, padre);
    await familia.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    const { body } = await familia.post('/api/ia/conversaciones');
    await familia.post(`/api/ia/conversaciones/${body.conversacion._id}/mensajes`).send({ contenido: 'le di una paliza y le dejé marcas' });

    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.docentesCurso.map(String)).toEqual([docente._id.toString()]);
    const aviso = await Notificacion.findOne({ usuarioId: docente._id, tipo: 'alerta_ia' }).lean();
    expect(aviso.mensaje).toMatch(/tu curso/);
    expect(await Notificacion.countDocuments({ usuarioId: admin._id, tipo: 'alerta_ia' })).toBe(1);

    const agent = await loginComo(app, docente);
    const res = await agent.get(`/api/ia/alertas/${alerta._id}`);
    expect(res.status).toBe(200);
    const actualizada = await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'en_atencion' });
    expect(actualizada.body.alerta.estado).toBe('en_atencion');
  });

  it('trazabilidad: la alerta guarda por qué se generó y el historial de cada cambio', async () => {
    const { admin } = await conAlerta();
    const agent = await loginComo(app, admin);
    const alerta = await AlertaRiesgo.findOne().lean();

    // por qué: regla segura con el fragmento exacto (sin LLM en los tests)
    expect(alerta.deteccion).toMatchObject({ fuente: 'reglas', decidio: 'regla' });
    expect(alerta.deteccion.reglaSegura).toMatchObject({ categoria: 'abuso_sexual', gravedad: 'grave' });
    expect(alerta.deteccion.reglaSegura.patron).toMatch(/abusaron de mi hija/);
    expect(alerta.historial).toHaveLength(1);
    expect(alerta.historial[0]).toMatchObject({ accion: 'creada', estado: 'nueva', por: null });

    await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'en_atencion', notas: 'Llamé a la familia.' });
    await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ notas: 'Se activó la ruta con ICBF.' });
    const res = await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'cerrada' });
    // repetir el mismo estado no agrega ruido al historial
    await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'cerrada' });

    const final = (await agent.get(`/api/ia/alertas/${alerta._id}`)).body.alerta;
    expect(res.status).toBe(200);
    expect(final.historial.map((h) => h.accion)).toEqual(['creada', 'estado', 'nota', 'estado']);
    expect(final.historial[1]).toMatchObject({ estado: 'en_atencion', nota: 'Llamé a la familia.' });
    expect(final.historial[1].por.nombre).toBe(admin.nombre);
    expect(final.historial[2].nota).toBe('Se activó la ruta con ICBF.');
    expect(final.atendidaEn).toBeTruthy();
    expect(final.cerradaEn).toBeTruthy();
  });

  it('cada mensaje de la familia guarda cómo se clasificó', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    await agent.post(`/api/ia/conversaciones/${conversacionId}/mensajes`).send({ contenido: 'a veces le pego con la chancla' });
    const conv = await ConversacionIA.findById(conversacionId).lean();
    const mensaje = conv.mensajes.find((m) => m.rol === 'usuario');
    expect(mensaje.deteccion).toMatchObject({ fuente: 'reglas', decidio: 'regla' });
    expect(mensaje.deteccion.reglaSegura).toMatchObject({ categoria: 'maltrato_fisico', gravedad: 'moderado' });
  });

  it('pedir ayuda (nivel 2) deja en la alerta la detección del mensaje que la originó', async () => {
    const { agent, conversacionId } = await prepararFamilia(app);
    await agent.post(`/api/ia/conversaciones/${conversacionId}/mensajes`).send({ contenido: 'a veces le pego con la chancla' });
    await agent.post(`/api/ia/conversaciones/${conversacionId}/ayuda`);
    const alerta = await AlertaRiesgo.findOne().lean();
    expect(alerta.origen).toBe('solicitada');
    expect(alerta.deteccion.reglaSegura.patron).toMatch(/le pego/);
    expect(alerta.historial[0]).toMatchObject({ accion: 'creada' });
    expect(String(alerta.historial[0].por)).toBe(String(alerta.usuarioId));
  });

  it('el responsable de convivencia atiende la alerta y queda registrado', async () => {
    const { institucion } = await conAlerta();
    const responsable = await crearDocente({ institucionId: institucion._id });
    await Institucion.findByIdAndUpdate(institucion._id, { responsableConvivenciaId: responsable._id });
    const agent = await loginComo(app, responsable);
    const alerta = await AlertaRiesgo.findOne().lean();

    const res = await agent
      .patch(`/api/ia/alertas/${alerta._id}`)
      .send({ estado: 'en_atencion', notas: 'Se llamó a la familia y se activó la ruta.' });

    expect(res.status).toBe(200);
    expect(res.body.alerta.estado).toBe('en_atencion');
    expect(res.body.alerta.atendidaPor._id).toBe(responsable._id.toString());
  });

  it('el admin abre el detalle de una alerta (destino de la notificación)', async () => {
    const { admin } = await conAlerta();
    const agent = await loginComo(app, admin);
    const alerta = await AlertaRiesgo.findOne().lean();

    const res = await agent.get(`/api/ia/alertas/${alerta._id}`);
    expect(res.status).toBe(200);
    expect(res.body.alerta.categoria).toBe('abuso_sexual');
    expect(res.body.alerta.usuarioId.nombre).toBeTruthy();
  });

  it('el detalle de una alerta de otra institución da 404', async () => {
    await conAlerta();
    const otra = await crearInstitucion();
    const otroAdmin = await crearAdministrador({ institucionId: otra._id });
    const agent = await loginComo(app, otroAdmin);
    const alerta = await AlertaRiesgo.findOne().lean();

    expect((await agent.get(`/api/ia/alertas/${alerta._id}`)).status).toBe(404);
  });

  it('rechaza un estado inválido', async () => {
    const { admin } = await conAlerta();
    const agent = await loginComo(app, admin);
    const alerta = await AlertaRiesgo.findOne().lean();

    expect((await agent.patch(`/api/ia/alertas/${alerta._id}`).send({ estado: 'archivada' })).status).toBe(400);
  });

  it('un padre no puede ver alertas', async () => {
    const { agent } = await conAlerta();
    expect((await agent.get('/api/ia/alertas')).status).toBe(403);
  });
});
