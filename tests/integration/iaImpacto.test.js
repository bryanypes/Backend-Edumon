import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import Curso from '../../src/models/Curso.js';
import Tarea from '../../src/models/Tarea.js';
import Entrega from '../../src/models/Entrega.js';
import { sembrarDemo, CLAVE_DEMO } from '../../src/scripts/seedDemo.js';
import { metricasDeAlertas } from '../../src/services/ia/impacto.js';
import { crearDocente, crearPadre, crearCurso } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

const H = 60 * 60 * 1000;
const LENTO = 60000;
const alerta = ({ origen = 'automatica', ambito = 'hogar', creada, atendida }) => ({
  origen,
  rutaAtencion: { ambito },
  createdAt: creada,
  historial: [
    { accion: 'creada', estado: 'nueva', en: creada },
    ...(atendida ? [{ accion: 'estado', estado: 'en_atencion', en: atendida }] : []),
  ],
});

describe('Métricas de impacto', () => {
  describe('alertas: plazos y tiempo hasta la primera atención (desde la bitácora)', () => {
    it('cuenta dentro/fuera del plazo y deja aparte las que aún están en plazo', () => {
      const ahora = new Date('2026-10-20T12:00:00Z');
      const hace = (h) => new Date(ahora.getTime() - h * H);
      const r = metricasDeAlertas([
        alerta({ creada: hace(10), atendida: hace(8) }),                         // grave, 2 h → dentro
        alerta({ creada: hace(50), atendida: hace(20) }),                        // grave, 30 h → fuera (plazo 24)
        alerta({ creada: hace(30) }),                                            // grave sin atender, vencida → fuera
        alerta({ creada: hace(2) }),                                             // grave sin atender, en plazo
        alerta({ origen: 'solicitada', ambito: 'escolar', creada: hace(60), atendida: hace(10) }), // moderado, 50 h → dentro (72)
      ], ahora);
      expect(r).toMatchObject({
        total: 5,
        porGravedad: { grave: 4, moderado: 1 },
        porAmbito: { hogar: { total: 4, grave: 4, moderado: 0 }, escolar: { total: 1, grave: 0, moderado: 1 } },
        atendidasDentroDelPlazo: 2,
        fueraDelPlazo: 2,
        sinAtenderAunEnPlazo: 1,
        porcentajeDentroDelPlazo: 50,
        plazosHoras: { grave: 24, moderado: 72, pendienteValidacion: true },
      });
      expect(r.horasPromedioHastaPrimeraAtencion).toBeCloseTo((2 + 30 + 50) / 3, 2);
    });

    it('los plazos se configuran por variable de entorno', () => {
      const antes = process.env.IA_PLAZO_ATENCION_HORAS_GRAVE;
      process.env.IA_PLAZO_ATENCION_HORAS_GRAVE = '1';
      try {
        const ahora = new Date();
        const r = metricasDeAlertas([alerta({ creada: new Date(ahora - 3 * H), atendida: new Date(ahora - 1 * H) })], ahora);
        expect(r).toMatchObject({ fueraDelPlazo: 1, plazosHoras: { grave: 1 } });
      } finally {
        if (antes === undefined) delete process.env.IA_PLAZO_ATENCION_HORAS_GRAVE; else process.env.IA_PLAZO_ATENCION_HORAS_GRAVE = antes;
      }
    });
  });

  describe('GET /api/ia/impacto (sobre el seed de demo)', () => {
    let app;
    let rectora;
    beforeEach(async () => {
      ({ app } = crearApp());
      vi.spyOn(console, 'log').mockImplementation(() => {});
      await sembrarDemo({ log: () => {} });
      rectora = await User.findOne({ telefono: '+573009990001' });
    }, LENTO);

    const comoRectora = async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ telefono: rectora.telefono, contraseña: CLAVE_DEMO });
      return agent;
    };

    it('uso, alertas por ámbito y gravedad, plazos y participación en retos, solo agregados', async () => {
      // 5 familias de Grado Quinto A entregan el reto del ciclo
      const quinto = await Curso.findOne({ nombre: 'Grado Quinto A' }).lean();
      const reto = await Tarea.findOne({ cursoId: quinto._id }).lean();
      const familias = quinto.participantes.filter((p) => p.etiqueta === 'padre').slice(0, 5);
      await Entrega.insertMany(familias.map((f) => ({ tareaId: reto._id, padreId: f.usuarioId, estado: 'enviada', fechaEntrega: new Date(), textoRespuesta: 'Reflexión de demo.' })));

      const res = await (await comoRectora()).get('/api/ia/impacto');
      expect(res.status).toBe(200);
      const b = res.body;
      expect(b.uso.familiasQueUsaronEdumon).toBeGreaterThanOrEqual(15);
      expect(b.uso.conversaciones).toBeGreaterThanOrEqual(b.uso.familiasQueUsaronEdumon);
      expect(b.alertas).toMatchObject({
        total: 5,
        porGravedad: { grave: 3, moderado: 2 },
        porAmbito: { escolar: { total: 3 }, hogar: { total: 1 }, personal: { total: 1 } },
        atendidasDentroDelPlazo: 1,
      });
      expect(b.alertas.horasPromedioHastaPrimeraAtencion).toBeGreaterThanOrEqual(0);
      const q = b.retosDelCiclo.porCurso.find((c) => c.nombre === 'Grado Quinto A');
      expect(q).toMatchObject({ familias: 7, familiasQueParticiparon: 5, retos: 1, entregas: 5, porcentajeParticipacion: 71.4 });
      const json = JSON.stringify(b);
      for (const f of familias) expect(json).not.toContain(String(f.usuarioId));
      expect(json).not.toMatch(/mensajeDisparador|telefono|correo/);
    }, LENTO);

    it('un curso con menos de 5 familias no se desagrega: va a "otros cursos"', async () => {
      const docente = await crearDocente({ institucionId: rectora.institucionId });
      const padres = await Promise.all([1, 2, 3].map(() => crearPadre()));
      await crearCurso({ institucionId: rectora.institucionId, docenteId: docente._id, nombre: 'Curso pequeño', participantes: padres.map((p) => ({ usuarioId: p._id, etiqueta: 'padre' })) });

      const b = (await (await comoRectora()).get('/api/ia/impacto')).body;
      expect(b.retosDelCiclo.porCurso.map((c) => c.nombre)).not.toContain('Curso pequeño');
      expect(b.retosDelCiclo.otrosCursos).toMatchObject({ cursos: 1, familias: 3 });
    }, LENTO);

    it('periodo: valida fechas y filtra', async () => {
      const agent = await comoRectora();
      expect((await agent.get('/api/ia/impacto?desde=no-es-fecha')).status).toBe(400);
      expect((await agent.get('/api/ia/impacto?desde=2026-10-10&hasta=2026-10-01')).status).toBe(400);
      const pasado = (await agent.get('/api/ia/impacto?desde=2020-01-01&hasta=2020-01-31')).body;
      expect(pasado).toMatchObject({ uso: { familiasQueUsaronEdumon: 0 }, alertas: { total: 0 } });
    }, LENTO);

    it('solo administrador: docente 403, sin sesión 401', async () => {
      const docente = await loginComo(app, await crearDocente({ institucionId: rectora.institucionId }));
      expect((await docente.get('/api/ia/impacto')).status).toBe(403);
      expect((await request(app).get('/api/ia/impacto')).status).toBe(401);
    }, LENTO);
  });
});
