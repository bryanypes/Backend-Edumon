import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { restablecerPiloto, leerContenidoPiloto } from '../../src/scripts/restablecerPiloto.js';
import Apk from '../../src/models/Apk.js';
import User from '../../src/models/User.js';
import Institucion from '../../src/models/Institucion.js';
import Curso from '../../src/models/Curso.js';
import Modulo from '../../src/models/Modulo.js';
import Tarea from '../../src/models/Tarea.js';
import Foro from '../../src/models/Foro.js';
import MensajeForo from '../../src/models/MensajeForo.js';
import { crearPadre, crearDocente } from '../helpers/factories.js';

// Datos ficticios: el comando real lee los del .env
const ENTORNO = {
  BOOTSTRAP_INSTITUCION_NOMBRE: 'Colegio de Prueba',
  BOOTSTRAP_INSTITUCION_NIT: '900000001',
  BOOTSTRAP_ADMIN_1_NOMBRE: 'Docente',
  BOOTSTRAP_ADMIN_1_APELLIDO: 'Piloto',
  BOOTSTRAP_ADMIN_1_CEDULA: '1000000001',
  BOOTSTRAP_ADMIN_1_TELEFONO: '3001234567',
  BOOTSTRAP_ADMIN_1_PASSWORD: '1000000001',
  BOOTSTRAP_ADMIN_1_ROL: 'docente',
  PILOTO_DOCENTE_TELEFONO: '3001234567',
  PILOTO_CURSO_NOMBRE: 'Curso Piloto',
  PILOTO_CURSO_DESCRIPCION: 'Descripción del curso piloto.',
  PILOTO_MODULO_1_TITULO: 'Módulo uno',
  PILOTO_MODULO_1_DESCRIPCION: 'Primero.',
  PILOTO_MODULO_2_TITULO: 'Módulo dos',
  PILOTO_MODULO_2_DESCRIPCION: 'Segundo.',
  PILOTO_TAREA_TITULO: 'Reto piloto',
  PILOTO_TAREA_DESCRIPCION: 'Asistir con ropa cómoda.',
  PILOTO_TAREA_FECHA_ENTREGA: '2026-10-29T15:06:00-05:00',
  PILOTO_TAREA_TIPO_ENTREGA: 'archivo',
  PILOTO_TAREA_MODULO: '2',
  PILOTO_FORO_TITULO: 'Foro piloto',
  PILOTO_FORO_DESCRIPCION: 'Para compartir.',
  PILOTO_FORO_FECHA: '2026-09-23T08:00:00-05:00',
  PILOTO_FORO_MENSAJE_1: 'Primer párrafo.\n\nSegundo párrafo.',
  PILOTO_FORO_MENSAJE_2: '¡Excelente!',
};

describe('npm run piloto:restablecer', () => {
  beforeEach(() => { for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v); });
  afterEach(() => vi.unstubAllEnvs());

  it('borra todo menos las APK y deja el curso, el reto y el foro a nombre de la docente', async () => {
    await Apk.create({ version: '1.0.0', url: 'https://cdn/x.apk', publicId: 'apks/x', tamano: 1, activa: true });
    await crearPadre();
    await crearDocente();
    await mongoose.connection.db.collection('cualquiera').insertOne({ basura: true });

    const resumen = await restablecerPiloto();

    expect(await Apk.countDocuments()).toBe(1);
    expect(await mongoose.connection.db.collection('cualquiera').countDocuments()).toBe(0);
    const usuarios = await User.find();
    expect(usuarios).toHaveLength(1);
    const [docente] = usuarios;
    expect(docente).toMatchObject({ nombre: 'Docente', rol: 'docente', primerInicioSesion: true });
    expect(docente.institucionId).toBeTruthy();
    expect((await Institucion.findById(docente.institucionId)).nombre).toBe('Colegio de Prueba');

    const curso = await Curso.findOne();
    expect(curso).toMatchObject({ nombre: 'Curso Piloto', estado: 'activo' });
    expect(String(curso.docenteId)).toBe(String(docente._id));
    const enOrdenDeLaApp = await Modulo.find({ cursoId: curso._id }).sort({ fechaCreacion: -1 });
    expect(enOrdenDeLaApp.map((m) => m.titulo)).toEqual(['Módulo uno', 'Módulo dos']);

    const tarea = await Tarea.findOne().populate('moduloId');
    expect(tarea).toMatchObject({ titulo: 'Reto piloto', tipoEntrega: 'archivo', estado: 'publicada' });
    expect(tarea.moduloId.titulo).toBe('Módulo dos');
    expect(tarea.fechaEntrega.toISOString()).toBe('2026-10-29T20:06:00.000Z');

    const foro = await Foro.findOne();
    expect(foro.createdAt.toISOString()).toBe('2026-09-23T13:00:00.000Z');
    const mensajes = await MensajeForo.find().sort({ createdAt: 1 });
    expect(mensajes.map((m) => m.contenido)).toEqual(['Primer párrafo.\n\nSegundo párrafo.', '¡Excelente!']);
    expect(mensajes.every((m) => String(m.usuarioId) === String(docente._id))).toBe(true);
    expect(String(mensajes[1].respuestaA)).toBe(String(mensajes[0]._id));
    expect(resumen.apksConservadas).toBe(1);
  });

  it('no borra nada si el .env está incompleto', async () => {
    vi.stubEnv('PILOTO_CURSO_NOMBRE', '');
    await crearPadre();
    await expect(restablecerPiloto()).rejects.toThrow(/PILOTO_CURSO_NOMBRE/);
    expect(await User.countDocuments()).toBe(1);
  });

  it('valida la fecha y el módulo del reto', () => {
    expect(() => leerContenidoPiloto({ ...ENTORNO, PILOTO_TAREA_MODULO: '7' })).toThrow(/PILOTO_TAREA_MODULO/);
    expect(() => leerContenidoPiloto({ ...ENTORNO, PILOTO_TAREA_FECHA_ENTREGA: 'mañana' })).toThrow(/fecha inválida/);
  });
});
