import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crearApp from '../../src/app.js';
import ConversacionIA from '../../src/models/ConversacionIA.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { VERSION_CONSENTIMIENTO } from '../../src/config/edumonIA.js';
import {
  crearPadre, crearDocente, crearAdministrador, crearInstitucion, crearCurso, crearTarea,
} from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const PANTALLAS = { eje: 'estilos_vida_saludable', subtema: 'pantallas' };
const SUENO = { eje: 'estilos_vida_saludable', subtema: 'sueno' };
const TEXTO_PRIVADO = 'texto privado que nunca debe salir';
const DIA = 24 * 60 * 60 * 1000;

// conversación con un mensaje del cuidador ya clasificado (solo la etiqueta cuenta)
const conversacionCon = (usuarioId, tema, { perfilId = null, hace = 0 } = {}) => ConversacionIA.create({
  usuarioId,
  perfilId,
  mensajes: [{ rol: 'usuario', contenido: `${TEXTO_PRIVADO} ${usuarioId}`, tema, creadoEn: new Date(Date.now() - hace) }],
});

const cursoConFamilias = async (n, { institucion } = {}) => {
  const inst = institucion ?? await crearInstitucion();
  const docente = await crearDocente({ institucionId: inst._id });
  const padres = await Promise.all(Array.from({ length: n }, () => crearPadre()));
  const curso = await crearCurso({
    institucionId: inst._id,
    docenteId: docente._id,
    participantes: [
      { usuarioId: docente._id, etiqueta: 'docente' },
      ...padres.map((p) => ({ usuarioId: p._id, etiqueta: 'padre' })),
    ],
  });
  return { institucion: inst, docente, padres, curso };
};

describe('Ciclo Edumon', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  const ciclo = async (usuario, cursoId) => (await loginComo(app, usuario)).get(`/api/ia/cursos/${cursoId}/ciclo`);

  describe('agregación anónima con mínimo 5 familias', () => {
    it('con 4 familias el tema NO se devuelve; con 5 sí', async () => {
      const { docente, padres, curso } = await cursoConFamilias(5);
      await Promise.all(padres.slice(0, 4).map((p) => conversacionCon(p._id, PANTALLAS)));

      let res = await ciclo(docente, curso._id);
      expect(res.status).toBe(200);
      expect(res.body.temas).toEqual([]);
      expect(res.body.hayTemasOcultos).toBe(true);
      expect(res.body.minimoFamilias).toBe(5);

      await conversacionCon(padres[4]._id, PANTALLAS);
      res = await ciclo(docente, curso._id);
      expect(res.body.temas).toEqual([expect.objectContaining({ ...PANTALLAS, familias: 5, subtemaLabel: 'Pantallas y celular' })]);
      expect(res.body.hayTemasOcultos).toBe(false);
    });

    it('los perfiles de una misma familia cuentan como una sola', async () => {
      const { docente, padres, curso } = await cursoConFamilias(4);
      await Promise.all(padres.map((p) => conversacionCon(p._id, PANTALLAS)));
      // la misma familia titular escribe desde 3 perfiles: sigue siendo 4 familias
      const perfiles = [1, 2, 3].map(() => new mongoose.Types.ObjectId());
      await Promise.all(perfiles.map((perfilId) => conversacionCon(padres[0]._id, PANTALLAS, { perfilId })));

      const res = await ciclo(docente, curso._id);
      expect(res.body.temas).toEqual([]);
    });

    it('cuenta familias, no mensajes', async () => {
      const { docente, padres, curso } = await cursoConFamilias(5);
      await Promise.all(padres.map((p) => conversacionCon(p._id, SUENO)));
      await Promise.all([1, 2, 3].map(() => conversacionCon(padres[0]._id, SUENO)));
      const res = await ciclo(docente, curso._id);
      expect(res.body.temas[0]).toMatchObject({ subtema: 'sueno', familias: 5 });
    });

    it('fuera de la ventana de 30 días no cuenta', async () => {
      const { docente, padres, curso } = await cursoConFamilias(5);
      await Promise.all(padres.slice(0, 4).map((p) => conversacionCon(p._id, PANTALLAS)));
      await conversacionCon(padres[4]._id, PANTALLAS, { hace: 31 * DIA });
      const res = await ciclo(docente, curso._id);
      expect(res.body.temas).toEqual([]);
      expect(res.body.ventana.dias).toBe(30);
    });

    it('una familia en varios cursos cuenta en todos', async () => {
      const a = await cursoConFamilias(4);
      const b = await cursoConFamilias(4, { institucion: a.institucion });
      const compartida = await crearPadre();
      for (const { curso } of [a, b]) {
        curso.participantes.push({ usuarioId: compartida._id, etiqueta: 'padre' });
        await curso.save();
      }
      await Promise.all([...a.padres, ...b.padres, compartida].map((p) => conversacionCon(p._id, PANTALLAS)));

      expect((await ciclo(a.docente, a.curso._id)).body.temas[0]).toMatchObject({ familias: 5 });
      expect((await ciclo(b.docente, b.curso._id)).body.temas[0]).toMatchObject({ familias: 5 });
    });

    it('nunca devuelve el texto de los mensajes ni quiénes escribieron', async () => {
      const { docente, padres, curso } = await cursoConFamilias(5);
      await Promise.all(padres.map((p) => conversacionCon(p._id, PANTALLAS)));
      const res = await ciclo(docente, curso._id);
      const json = JSON.stringify(res.body);
      expect(json).not.toContain(TEXTO_PRIVADO);
      for (const p of padres) expect(json).not.toContain(String(p._id));
    });

    it('muestra los retos ya creados sobre el tema (temas → reto creado)', async () => {
      const { docente, padres, curso } = await cursoConFamilias(5);
      await Promise.all(padres.map((p) => conversacionCon(p._id, PANTALLAS)));
      await crearTarea({ cursoId: curso._id, docenteId: docente._id, titulo: 'Reto: hora sin pantallas', escuelaPadres: PANTALLAS });

      const res = await ciclo(docente, curso._id);
      expect(res.body.temas[0].retosCreados).toEqual([expect.objectContaining({ titulo: 'Reto: hora sin pantallas', estado: 'publicada' })]);
    });
  });

  it('el chat guarda solo la etiqueta del tema en cada mensaje (y no en riesgo grave)', async () => {
    const institucion = await crearInstitucion();
    const padre = await crearPadre({ institucionId: institucion._id });
    const agent = await loginComo(app, padre);
    await agent.post('/api/ia/consentimiento').send({ version: VERSION_CONSENTIMIENTO });
    const { body } = await agent.post('/api/ia/conversaciones');
    const url = `/api/ia/conversaciones/${body.conversacion._id}/mensajes`;
    await agent.post(url).send({ contenido: 'mi hijo de 9 no suelta el celular' });
    await agent.post(url).send({ contenido: 'creo que abusaron de mi hija' });

    const conv = await ConversacionIA.findById(body.conversacion._id).lean();
    const delUsuario = conv.mensajes.filter((m) => m.rol === 'usuario');
    expect(delUsuario[0].tema).toEqual(PANTALLAS);
    expect(delUsuario[1].tema).toBeNull();
  });

  describe('sugerencia de módulo y reto desde el ciclo', () => {
    it('con un tema visible sugiere módulos y un borrador de reto sobre ese tema', async () => {
      const { docente, padres, curso } = await cursoConFamilias(5);
      await Promise.all(padres.map((p) => conversacionCon(p._id, PANTALLAS)));

      const res = await (await loginComo(app, docente)).post(`/api/ia/cursos/${curso._id}/ciclo/sugerencia`);
      expect(res.status).toBe(200);
      expect(res.body.basadoEn).toMatchObject({ ...PANTALLAS, familias: 5 });
      expect(res.body.modulos.modulos.length).toBeGreaterThan(0);
      expect(res.body.reto).toBeTruthy();
      expect(res.body.reto.escuelaPadres ?? res.body.reto).toMatchObject({ subtema: 'pantallas' });
    });

    it('sin temas que reúnan 5 familias responde 422 y no sugiere nada', async () => {
      const { docente, padres, curso } = await cursoConFamilias(4);
      await Promise.all(padres.map((p) => conversacionCon(p._id, PANTALLAS)));
      const res = await (await loginComo(app, docente)).post(`/api/ia/cursos/${curso._id}/ciclo/sugerencia`);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SIN_TEMAS_SUFICIENTES');
    });
  });

  describe('permisos', () => {
    it('el admin de la institución puede ver el ciclo', async () => {
      const { institucion, curso } = await cursoConFamilias(1);
      const admin = await crearAdministrador({ institucionId: institucion._id });
      expect((await ciclo(admin, curso._id)).status).toBe(200);
    });

    it('docente de otro curso, admin de otra institución: 404', async () => {
      const { institucion, curso } = await cursoConFamilias(1);
      const otroDocente = await crearDocente({ institucionId: institucion._id });
      expect((await ciclo(otroDocente, curso._id)).status).toBe(404);
      const otra = await crearInstitucion();
      expect((await ciclo(await crearAdministrador({ institucionId: otra._id }), curso._id)).status).toBe(404);
    });

    it('una familia del curso: 403; sin sesión: 401; ID inválido: 400', async () => {
      const { docente, padres, curso } = await cursoConFamilias(1);
      expect((await ciclo(padres[0], curso._id)).status).toBe(403);
      expect((await (await loginComo(app, padres[0])).post(`/api/ia/cursos/${curso._id}/ciclo/sugerencia`)).status).toBe(403);
      expect((await request(app).get(`/api/ia/cursos/${curso._id}/ciclo`)).status).toBe(401);
      expect((await ciclo(docente, 'no-es-id')).status).toBe(400);
    });
  });
});
