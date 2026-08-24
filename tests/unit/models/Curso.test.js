import { describe, it, expect } from 'vitest';
import Curso from '../../../src/models/Curso.js';
import { crearCurso, crearDocente, crearInstitucion, crearPadre } from '../../helpers/factories.js';

describe('Curso — validaciones de schema', () => {
  it('requiere nombre, descripcion, docenteId e institucionId', () => {
    const curso = new Curso({});
    const error = curso.validateSync();
    expect(error.errors.nombre).toBeDefined();
    expect(error.errors.descripcion).toBeDefined();
    expect(error.errors.docenteId).toBeDefined();
    expect(error.errors.institucionId).toBeDefined();
  });

  it('rechaza un docenteId que corresponde a un usuario con otro rol', async () => {
    const institucion = await crearInstitucion();
    const padre = await crearPadre();
    const curso = new Curso({
      nombre: 'Curso X',
      descripcion: 'Descripción de prueba',
      docenteId: padre._id,
      institucionId: institucion._id,
    });
    await expect(curso.validate()).rejects.toThrow(/docenteId debe corresponder a un usuario con rol docente/);
  });

  it('acepta un docenteId que sí corresponde a un usuario docente', async () => {
    const institucion = await crearInstitucion();
    const docente = await crearDocente({ institucionId: institucion._id });
    const curso = new Curso({
      nombre: 'Curso X',
      descripcion: 'Descripción de prueba',
      docenteId: docente._id,
      institucionId: institucion._id,
    });
    await expect(curso.validate()).resolves.toBeUndefined();
  });

  it('rechaza un color que no es un hex válido', () => {
    const curso = new Curso({
      nombre: 'Curso X',
      descripcion: 'Descripción',
      docenteId: '507f1f77bcf86cd799439011',
      institucionId: '507f1f77bcf86cd799439012',
      color: 'azul',
    });
    expect(curso.validateSync().errors.color).toBeDefined();
  });

  it('acepta un color hexadecimal de 3 o 6 dígitos', () => {
    const base = {
      nombre: 'Curso X',
      descripcion: 'Descripción',
      docenteId: '507f1f77bcf86cd799439011',
      institucionId: '507f1f77bcf86cd799439012',
    };
    expect(new Curso({ ...base, color: '#FFF' }).validateSync()?.errors.color).toBeUndefined();
    expect(new Curso({ ...base, color: '#3B82F6' }).validateSync()?.errors.color).toBeUndefined();
  });

  it('estado por defecto es "activo"', () => {
    const curso = new Curso({
      nombre: 'Curso X',
      descripcion: 'Descripción',
      docenteId: '507f1f77bcf86cd799439011',
      institucionId: '507f1f77bcf86cd799439012',
    });
    expect(curso.estado).toBe('activo');
  });
});

describe('Curso — métodos de participantes', () => {
  it('agregarParticipante añade al usuario si no estaba, y no lo duplica si ya estaba', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();

    curso.agregarParticipante(padre._id, 'padre');
    expect(curso.esParticipante(padre._id)).toBe(true);
    const totalTrasPrimeraVez = curso.participantes.length;

    curso.agregarParticipante(padre._id, 'padre');
    expect(curso.participantes.length).toBe(totalTrasPrimeraVez);
  });

  it('removerParticipante quita al usuario de la lista', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    expect(curso.esParticipante(padre._id)).toBe(true);

    curso.removerParticipante(padre._id);
    expect(curso.esParticipante(padre._id)).toBe(false);
  });

  it('el virtual totalParticipantes refleja el tamaño del array', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    expect(curso.totalParticipantes).toBe(curso.participantes.length);
  });
});
