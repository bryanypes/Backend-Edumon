import { describe, it, expect } from 'vitest';
import Foro from '../../../src/models/Foro.js';
import { crearForo, crearCurso, crearDocente, crearAdministrador, crearPadre } from '../../helpers/factories.js';

describe('Foro — validaciones de schema', () => {
  it('requiere titulo, descripcion, docenteId y cursoId', () => {
    const error = new Foro({}).validateSync();
    expect(error.errors.titulo).toBeDefined();
    expect(error.errors.descripcion).toBeDefined();
    expect(error.errors.docenteId).toBeDefined();
    expect(error.errors.cursoId).toBeDefined();
  });

  it('rechaza un docenteId que no es docente ni administrador', async () => {
    const padre = await crearPadre();
    const foro = new Foro({
      titulo: 'Foro', descripcion: 'Descripción', docenteId: padre._id, cursoId: '507f1f77bcf86cd799439012',
    });
    await expect(foro.validate()).rejects.toThrow(/creador debe ser docente o administrador/);
  });

  it('acepta un administrador como creador del foro', async () => {
    const admin = await crearAdministrador();
    const foro = new Foro({
      titulo: 'Foro', descripcion: 'Descripción', docenteId: admin._id, cursoId: '507f1f77bcf86cd799439012',
    });
    await expect(foro.validate()).resolves.toBeUndefined();
  });

  it('rechaza más de 5 archivos adjuntos', async () => {
    const docente = await crearDocente();
    const archivos = Array.from({ length: 6 }, (_, i) => ({
      url: `http://x.com/${i}.jpg`, publicId: `id${i}`, tipo: 'imagen', nombre: `${i}.jpg`,
    }));
    const foro = new Foro({
      titulo: 'Foro', descripcion: 'Descripción', docenteId: docente._id, cursoId: '507f1f77bcf86cd799439012', archivos,
    });
    await expect(foro.validate()).rejects.toThrow(/No se pueden adjuntar más de 5 archivos/);
  });

  it('estado por defecto es "abierto" y publico por defecto es false', async () => {
    const docente = await crearDocente();
    const foro = new Foro({ titulo: 'Foro', descripcion: 'Descripción', docenteId: docente._id, cursoId: '507f1f77bcf86cd799439012' });
    expect(foro.estado).toBe('abierto');
    expect(foro.publico).toBe(false);
  });
});

describe('Foro — métodos', () => {
  it('estaAbierto refleja el campo estado', async () => {
    const foro = await crearForo();
    expect(foro.estaAbierto()).toBe(true);
    foro.estado = 'cerrado';
    expect(foro.estaAbierto()).toBe(false);
  });

  it('tieneAcceso es true para el docente del curso y para participantes', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();

    const foro = await crearForo({ cursoId: curso._id, docenteId: curso.docenteId });

    expect(await foro.tieneAcceso(curso.docenteId)).toBe(true);
    expect(await foro.tieneAcceso(padre._id)).toBe(true);
  });

  it('tieneAcceso es false para un usuario ajeno al curso', async () => {
    const foro = await crearForo();
    const ajeno = await crearPadre();
    expect(await foro.tieneAcceso(ajeno._id)).toBe(false);
  });
});
