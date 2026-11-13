import { describe, it, expect, beforeEach } from 'vitest';
import crearApp from '../../src/app.js';
import User from '../../src/models/User.js';
import Tarea from '../../src/models/Tarea.js';
import { crearCurso, crearModulo, crearPadre } from '../helpers/factories.js';
import { loginComo } from '../helpers/authClient.js';

// Crear y editar retos en multipart/form-data (como la web y la app): adjuntos
// y campos array enviados como JSON o en notación campo[].
describe('retos en multipart con adjuntos y campos array', () => {
  let app;
  beforeEach(() => {
    ({ app } = crearApp());
  });

  const pdf = Buffer.from('%PDF-1.4\n%prueba\n');
  const futura = () => new Date(Date.now() + 7 * 864e5).toISOString();

  async function preparar() {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.participantes.push({ usuarioId: padre._id, etiqueta: 'padre' });
    await curso.save();
    const modulo = await crearModulo({ cursoId: curso._id });
    const agente = await loginComo(app, await User.findById(curso.docenteId));
    return { curso, modulo, padre, agente };
  }

  it('crea un reto con adjunto y arrays enviados como JSON', async () => {
    const { curso, modulo, padre, agente } = await preparar();
    const res = await agente
      .post('/api/tareas')
      .field('titulo', 'Reto con adjunto')
      .field('fechaEntrega', futura())
      .field('tipoEntrega', 'archivo')
      .field('cursoId', String(curso._id))
      .field('moduloId', String(modulo._id))
      .field('asignacionTipo', 'seleccionados')
      .field('participantesSeleccionados', JSON.stringify([String(padre._id)]))
      .field('etiquetas', JSON.stringify(['lectura', 'familia']))
      .field('enlaces', JSON.stringify([{ url: 'https://example.com/guia', titulo: 'Guía' }]))
      .attach('archivos', pdf, { filename: 'guia.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    const tarea = await Tarea.findById(res.body.tarea._id).lean();
    expect(tarea.participantesSeleccionados.map(String)).toEqual([String(padre._id)]);
    expect(tarea.etiquetas).toEqual(['lectura', 'familia']);
    expect(tarea.archivosAdjuntos.length).toBeGreaterThanOrEqual(2); // archivo + enlace
  });

  it('crea un reto con arrays en notación campo[] (un solo valor)', async () => {
    const { curso, modulo, padre, agente } = await preparar();
    const res = await agente
      .post('/api/tareas')
      .field('titulo', 'Reto con corchetes')
      .field('fechaEntrega', futura())
      .field('tipoEntrega', 'texto')
      .field('cursoId', String(curso._id))
      .field('moduloId', String(modulo._id))
      .field('asignacionTipo', 'seleccionados')
      .field('participantesSeleccionados[]', String(padre._id))
      .field('etiquetas[]', 'ciencias');

    expect(res.status).toBe(201);
    const tarea = await Tarea.findById(res.body.tarea._id).lean();
    expect(tarea.participantesSeleccionados.map(String)).toEqual([String(padre._id)]);
    expect(tarea.etiquetas).toEqual(['ciencias']);
  });

  it('edita un reto: agrega adjunto y enlace, quita un archivo y cambia la asignación', async () => {
    const { curso, modulo, padre, agente } = await preparar();
    const creado = await agente
      .post('/api/tareas')
      .field('titulo', 'Reto a editar')
      .field('fechaEntrega', futura())
      .field('tipoEntrega', 'archivo')
      .field('cursoId', String(curso._id))
      .field('moduloId', String(modulo._id))
      .attach('archivos', pdf, { filename: 'original.pdf', contentType: 'application/pdf' });
    expect(creado.status).toBe(201);
    const original = (await Tarea.findById(creado.body.tarea._id).lean()).archivosAdjuntos.find(
      (a) => a.tipo !== 'enlace',
    );

    const res = await agente
      .put(`/api/tareas/${creado.body.tarea._id}`)
      .field('titulo', 'Reto editado')
      .field('asignacionTipo', 'seleccionados')
      .field('participantesSeleccionados', JSON.stringify([String(padre._id)]))
      .field('archivosAEliminar', JSON.stringify([original.publicId]))
      .field('nuevosEnlaces', JSON.stringify([{ url: 'https://example.com/video', titulo: 'Video' }]))
      .attach('archivos', pdf, { filename: 'nuevo.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    const tarea = await Tarea.findById(creado.body.tarea._id).lean();
    expect(tarea.titulo).toBe('Reto editado');
    expect(tarea.participantesSeleccionados.map(String)).toEqual([String(padre._id)]);
    expect(tarea.archivosAdjuntos.some((a) => a.publicId === original.publicId)).toBe(false);
    expect(tarea.archivosAdjuntos.some((a) => (a.nombre || '').includes('nuevo'))).toBe(true);
    expect(tarea.archivosAdjuntos.some((a) => (a.url || '').includes('example.com/video'))).toBe(true);
  });
});
