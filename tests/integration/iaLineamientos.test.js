import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import Notificacion from '../../src/models/Notificacion.js';
import LineamientoEscuelaPadres from '../../src/models/LineamientoEscuelaPadres.js';
import { cargarFichas } from '../../src/scripts/seedFichas.js';
import { textoDePdf } from '../../src/services/ia/lineamientos.js';
import {
  crearInstitucion, crearAdministrador, crearDocente, crearCurso, crearModulo, crearTarea,
} from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

// GROQ_API_KEY vacía en tests: los lineamientos salen de la plantilla

// PDF mínimo de una página con una línea de texto (offsets de xref calculados)
const pdfConTexto = (texto) => {
  const contenido = `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objetos.map((obj, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
};

const colegio = async (app) => {
  const institucion = await crearInstitucion();
  const admin = await crearAdministrador({ institucionId: institucion._id });
  const docente = await crearDocente({ institucionId: institucion._id });
  const otroDocente = await crearDocente({ institucionId: institucion._id });
  const curso = await crearCurso({
    institucionId: institucion._id, docenteId: docente._id, nombre: 'Grado Quinto',
    participantes: [{ usuarioId: docente._id, etiqueta: 'docente' }],
  });
  const cursoOtro = await crearCurso({
    institucionId: institucion._id, docenteId: otroDocente._id, nombre: 'Grado Transición',
    participantes: [{ usuarioId: otroDocente._id, etiqueta: 'docente' }],
  });
  return {
    institucion, admin, docente, otroDocente, curso, cursoOtro,
    agentAdmin: await loginComo(app, admin),
    agentDocente: await loginComo(app, docente),
  };
};

describe('Lineamientos de escuela de padres', () => {
  let app;
  beforeEach(async () => {
    ({ app } = crearApp());
    await cargarFichas();
  });

  it('lee el texto de un PDF', async () => {
    expect(await textoDePdf(pdfConTexto('Circular 015 de la Secretaria de Educacion'))).toMatch(/Circular 015/);
  });

  it('el admin genera un borrador desde el PDF y sus indicaciones (sin publicar)', async () => {
    const { agentAdmin } = await colegio(app);
    const res = await agentAdmin
      .post('/api/ia/lineamientos/borrador')
      .field('instrucciones', 'Cada grupo publica un reto por periodo\nLa evidencia es una foto y una reflexión')
      .attach('archivo', pdfConTexto('Circular 015: las escuelas de padres deben tener minimo tres encuentros al ano'), 'circular.pdf');

    expect(res.status).toBe(201);
    expect(res.body.leidoDelPdf).toBeGreaterThan(20);
    expect(res.body.lineamiento.borrador.resumenComunicado).toMatch(/Circular 015/);
    expect(res.body.lineamiento.borrador.indicacionesDocentes).toContain('Cada grupo publica un reto por periodo');
    expect(res.body.lineamiento.publicado).toBeNull();
    expect(res.body.cursos).toHaveLength(2);
  });

  it('rechaza archivos que no son PDF y peticiones vacías', async () => {
    const { agentAdmin } = await colegio(app);
    const noPdf = await agentAdmin.post('/api/ia/lineamientos/borrador')
      .attach('archivo', Buffer.from('hola'), 'notas.txt');
    expect(noPdf.status).toBe(400);
    expect((await agentAdmin.post('/api/ia/lineamientos/borrador').send({})).status).toBe(400);
  });

  it('un docente no puede generar ni publicar lineamientos', async () => {
    const { agentDocente } = await colegio(app);
    expect((await agentDocente.post('/api/ia/lineamientos/borrador').send({ instrucciones: 'x' })).status).toBe(403);
    expect((await agentDocente.post('/api/ia/lineamientos/publicar')).status).toBe(403);
  });

  it('publicar avisa a todos los docentes y el docente solo ve lo publicado', async () => {
    const { agentAdmin, agentDocente, docente, otroDocente, curso } = await colegio(app);
    await agentAdmin.post('/api/ia/lineamientos/borrador').send({ instrucciones: 'Trabajar pantallas en primaria' });

    // edición del admin: meta propia para Quinto y un curso ajeno que se descarta
    const editado = await agentAdmin.put('/api/ia/lineamientos').send({
      borrador: {
        objetivo: 'Acompañar a las familias en el uso de pantallas',
        ejesObligatorios: ['estilos_vida_saludable', 'inventado'],
        retosPorPeriodo: 2,
        porCurso: [
          { cursoId: curso._id, temasPrioritarios: ['Celular antes de dormir'], indicaciones: 'Usar ejemplos de 10 años', retosPorPeriodo: 3 },
          { cursoId: '64b000000000000000000000', temasPrioritarios: ['x'] },
        ],
      },
    });
    expect(editado.status).toBe(200);
    expect(editado.body.lineamiento.borrador.ejesObligatorios).toEqual(['estilos_vida_saludable']);
    expect(editado.body.lineamiento.borrador.porCurso).toHaveLength(1);

    // antes de publicar, el docente no ve nada
    expect((await agentDocente.get('/api/ia/lineamientos')).body.lineamiento).toBeNull();

    const pub = await agentAdmin.post('/api/ia/lineamientos/publicar');
    expect(pub.status).toBe(200);
    expect(pub.body.docentesNotificados).toBe(2);
    expect(pub.body.lineamiento.version).toBe(1);
    for (const d of [docente, otroDocente]) {
      const aviso = await Notificacion.findOne({ usuarioId: d._id, tipo: 'sistema' }).lean();
      expect(aviso.metadata.get?.('destino') ?? aviso.metadata.destino).toBe('/escuela-padres/lineamientos');
    }

    const vista = await agentDocente.get('/api/ia/lineamientos');
    expect(vista.body.lineamiento.publicado.objetivo).toMatch(/pantallas/);
    expect(vista.body.lineamiento.fuente).toBeUndefined();
    expect(vista.body.lineamiento.borrador).toBeUndefined();
  });

  it('seguimiento: retos del grupo frente a la meta y ejes que faltan', async () => {
    const { agentAdmin, agentDocente, docente, curso, cursoOtro } = await colegio(app);
    await LineamientoEscuelaPadres.create({
      institucionId: curso.institucionId,
      publicado: {
        objetivo: 'x', retosPorPeriodo: 1, ejesObligatorios: ['crianza_amorosa', 'estilos_vida_saludable'],
        porCurso: [{ cursoId: curso._id, retosPorPeriodo: 2 }],
      },
      version: 1,
    });
    const modulo = await crearModulo({ cursoId: curso._id });
    await crearTarea({
      cursoId: curso._id, moduloId: modulo._id, docenteId: docente._id,
      escuelaPadres: { eje: 'crianza_amorosa', subtema: 'rabietas', tema: 'Rabietas' },
    });
    await crearTarea({ cursoId: curso._id, moduloId: modulo._id, docenteId: docente._id }); // reto normal: no cuenta

    const res = await agentAdmin.get('/api/ia/lineamientos/seguimiento');
    expect(res.status).toBe(200);
    const quinto = res.body.cursos.find((c) => c.cursoId === String(curso._id));
    expect(quinto).toMatchObject({ meta: 2, publicados: 1, estado: 'en_progreso', ejesFaltantes: ['estilos_vida_saludable'] });
    const transicion = res.body.cursos.find((c) => c.cursoId === String(cursoOtro._id));
    expect(transicion).toMatchObject({ meta: 1, publicados: 0, estado: 'sin_retos' });

    // el docente solo ve sus grupos
    const delDocente = await agentDocente.get('/api/ia/lineamientos/seguimiento');
    expect(delDocente.body.cursos.map((c) => c.cursoId)).toEqual([String(curso._id)]);
  });

  it('el asistente de retos usa los lineamientos: sin tema propone uno prioritario, sugiere módulo y duración', async () => {
    const { agentDocente, curso } = await colegio(app);
    await LineamientoEscuelaPadres.create({
      institucionId: curso.institucionId,
      publicado: { objetivo: 'x', porCurso: [{ cursoId: curso._id, temasPrioritarios: ['Uso del celular en la noche'] }] },
      version: 3,
      publicadoEn: new Date(),
    });
    const modulo = await crearModulo({ cursoId: curso._id, titulo: 'Pantallas y celular en casa' });

    const res = await agentDocente.post('/api/ia/retos/borrador').send({ cursoId: curso._id });
    expect(res.status).toBe(200);
    expect(res.body.borrador.subtema).toBe('pantallas');
    expect(res.body.borrador.lineamientosAplicados.version).toBe(3);
    expect(res.body.borrador.moduloIdSugerido).toBe(String(modulo._id));
    expect(res.body.borrador.duracionDias).toBe(7);
    expect(res.body.borrador.recursos.length).toBeGreaterThan(0);
    expect(res.body.borrador.descripcionHtml).toMatch(/Para profundizar/);
  });

  it('sin lineamientos ni tema, el asistente sigue pidiendo un tema', async () => {
    const { agentDocente, curso } = await colegio(app);
    expect((await agentDocente.post('/api/ia/retos/borrador').send({ cursoId: curso._id })).status).toBe(400);
  });
});
