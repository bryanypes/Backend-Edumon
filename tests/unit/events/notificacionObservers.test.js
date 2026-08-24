import { describe, it, expect, vi, beforeEach } from 'vitest';

const notificarMock = vi.fn();
const notificarFamiliaMock = vi.fn();
const notificarFamiliasMock = vi.fn();

vi.mock('../../../src/notifications/NotificadorFacade.js', () => ({
  default: {
    notificar: (...args) => notificarMock(...args),
    notificarFamilia: (...args) => notificarFamiliaMock(...args),
    notificarFamilias: (...args) => notificarFamiliasMock(...args),
    notificarMultiples: vi.fn(),
  },
}));

// registrarObservers() ya se llama una vez por archivo en tests/setup/vitest.setup.js
// (beforeAll global, igual que server.js en producción) — como ese beforeAll
// corre antes de que este archivo importe NotificacionObservers.js, y el mock
// de arriba ya está hoisteado en el grafo de módulos de ESTE archivo, los
// observers que registró el setup global ya están enlazados al notificador
// mockeado de aquí. Registrar de nuevo aquí duplicaría cada suscripción.
const { eventBus, EVENTOS } = await import('../../../src/events/EventBus.js');
const { crearCurso, crearPadre, crearDocente, crearSuperadmin, crearTarea, crearEntrega, crearForo, crearMensajeForo } = await import('../../helpers/factories.js');

beforeEach(() => {
  notificarMock.mockClear();
  notificarFamiliaMock.mockClear();
  notificarFamiliasMock.mockClear();
});

// Los observers de tarea.creada/tarea.cerrada hacen una consulta real a Mongo
// (resolverDestinatariosTarea) antes de notificar, así que un solo tick
// (setImmediate) no alcanza a esperar esa I/O real. Se hace polling sobre el
// propio mock hasta que efectivamente lo llamen, con un timeout de seguridad.
const esperarLlamada = async (mockFn, timeoutMs = 2000) => {
  const inicio = Date.now();
  while (mockFn.mock.calls.length === 0) {
    if (Date.now() - inicio > timeoutMs) {
      throw new Error('Timeout esperando a que el observer llamara al mock');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe('NotificacionObservers — TAREA_CREADA / TAREA_CERRADA', () => {
  it('notifica a las familias de los padres participantes del curso cuando se crea una tarea', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({ cursoId: curso._id, docenteId: curso.docenteId, asignacionTipo: 'todos' });

    eventBus.publicar(EVENTOS.TAREA_CREADA, tarea);
    await esperarLlamada(notificarFamiliasMock);

    expect(notificarFamiliasMock).toHaveBeenCalledTimes(1);
    const [idsNotificados, datos] = notificarFamiliasMock.mock.calls[0];
    expect(idsNotificados.map(String)).toContain(padre._id.toString());
    expect(datos.tipo).toBe('tarea');
    expect(datos.mensaje).toContain(tarea.titulo);
  });

  it('notifica cuando se cierra una tarea', async () => {
    const curso = await crearCurso();
    const padre = await crearPadre();
    curso.agregarParticipante(padre._id, 'padre');
    await curso.save();

    const tarea = await crearTarea({ cursoId: curso._id, docenteId: curso.docenteId, asignacionTipo: 'todos' });

    eventBus.publicar(EVENTOS.TAREA_CERRADA, tarea);
    await esperarLlamada(notificarFamiliasMock);

    expect(notificarFamiliasMock).toHaveBeenCalledTimes(1);
    expect(notificarFamiliasMock.mock.calls[0][1].mensaje).toMatch(/cerrada/);
  });
});

describe('NotificacionObservers — ENTREGA_CREADA', () => {
  it('notifica al docente de la tarea cuando un padre entrega', async () => {
    const tarea = await crearTarea();
    const padre = await crearPadre();
    const entrega = await crearEntrega({ tareaId: tarea._id, padreId: padre._id });

    eventBus.publicar(EVENTOS.ENTREGA_CREADA, {
      entrega,
      tarea: { ...tarea.toObject(), docenteId: tarea.docenteId },
      padre,
    });
    await esperarLlamada(notificarMock);

    expect(notificarMock).toHaveBeenCalledTimes(1);
    const [destinatarioId, datos] = notificarMock.mock.calls[0];
    expect(destinatarioId.toString()).toBe(tarea.docenteId.toString());
    expect(datos.tipo).toBe('entrega');
    expect(datos.mensaje).toContain(padre.nombre);
  });
});

describe('NotificacionObservers — ENTREGA_CALIFICADA (usa valoracion, no el campo legado "nota")', () => {
  it('notifica a la familia del padre con la valoración en la escala 1-5, sin "undefined"', async () => {
    const tarea = await crearTarea();
    const padre = await crearPadre();
    const entrega = await crearEntrega({
      tareaId: tarea._id,
      padreId: padre._id,
      estado: 'enviada',
      calificacion: { valoracion: 4, docenteId: tarea.docenteId },
    });
    const docente = { _id: tarea.docenteId, nombre: 'Prof', apellido: 'Docente' };

    eventBus.publicar(EVENTOS.ENTREGA_CALIFICADA, {
      entrega,
      tarea,
      padre,
      docente,
    });
    await esperarLlamada(notificarFamiliaMock);

    expect(notificarFamiliaMock).toHaveBeenCalledTimes(1);
    const [padreId, datos] = notificarFamiliaMock.mock.calls[0];
    expect(padreId.toString()).toBe(padre._id.toString());
    expect(datos.tipo).toBe('calificacion');
    expect(datos.mensaje).toContain('Valoración: 4/5');
    expect(datos.mensaje).not.toMatch(/undefined/);
    expect(datos.metadata.valoracion).toBe(4);
  });
});

describe('NotificacionObservers — USUARIO_BIENVENIDA / USUARIO_AGREGADO_CURSO', () => {
  it('envía un mensaje de bienvenida al usuario recién creado', async () => {
    const padre = await crearPadre();

    eventBus.publicar(EVENTOS.USUARIO_BIENVENIDA, padre);
    await esperarLlamada(notificarMock);

    expect(notificarMock).toHaveBeenCalledTimes(1);
    const [usuarioId, datos] = notificarMock.mock.calls[0];
    expect(usuarioId.toString()).toBe(padre._id.toString());
    expect(datos.tipo).toBe('sistema');
  });

  it('notifica a la familia cuando se agrega a un usuario a un curso', async () => {
    const padre = await crearPadre();
    const curso = await crearCurso();

    eventBus.publicar(EVENTOS.USUARIO_AGREGADO_CURSO, { usuarioId: padre._id, curso });
    await esperarLlamada(notificarFamiliaMock);

    expect(notificarFamiliaMock).toHaveBeenCalledTimes(1);
    expect(notificarFamiliaMock.mock.calls[0][1].mensaje).toContain(curso.nombre);
  });
});

describe('NotificacionObservers — FORO_NUEVO_MENSAJE', () => {
  it('notifica a todos los participantes del curso menos al autor', async () => {
    const padreA = await crearPadre();
    const padreB = await crearPadre();
    const curso = await crearCurso();
    curso.agregarParticipante(padreA._id, 'padre');
    curso.agregarParticipante(padreB._id, 'padre');
    await curso.save();

    const foro = await crearForo({ cursoId: curso._id, docenteId: curso.docenteId });
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: padreA._id, contenido: 'Hola a todos' });
    await mensaje.populate('usuarioId', 'nombre apellido rol');

    eventBus.publicar(EVENTOS.FORO_NUEVO_MENSAJE, { mensaje, foro });
    await esperarLlamada(notificarFamiliasMock);

    expect(notificarFamiliasMock).toHaveBeenCalledTimes(1);
    const [destinatarios, datos] = notificarFamiliasMock.mock.calls[0];
    const idsDestinatarios = destinatarios.map(String);
    expect(idsDestinatarios).not.toContain(padreA._id.toString()); // el autor no se notifica a sí mismo
    expect(idsDestinatarios).toContain(padreB._id.toString());
    expect(idsDestinatarios).toContain(curso.docenteId.toString());
    expect(datos.tipo).toBe('foro');
    expect(datos.mensaje).toContain(foro.titulo);
  });

  it('no notifica a nadie (sin lanzar) si el autor es el único participante del curso', async () => {
    const foro = await crearForo();
    const mensaje = await crearMensajeForo({ foroId: foro._id, usuarioId: foro.docenteId });
    await mensaje.populate('usuarioId', 'nombre apellido rol');

    eventBus.publicar(EVENTOS.FORO_NUEVO_MENSAJE, { mensaje, foro });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(notificarFamiliasMock).not.toHaveBeenCalled();
  });
});

describe('NotificacionObservers — BUZON_MENSAJE_RECIBIDO', () => {
  it('notifica al destinatario (superadmin) con los datos del mensaje de contacto', async () => {
    const superadmin = await crearSuperadmin();
    const mensaje = { _id: '507f1f77bcf86cd799439099', nombre: 'Interesado', correo: 'x@test.com', telefono: '+573000000000', mensaje: 'Hola, quiero información' };

    eventBus.publicar(EVENTOS.BUZON_MENSAJE_RECIBIDO, { destinatario: superadmin, mensaje });
    await esperarLlamada(notificarMock);

    expect(notificarMock).toHaveBeenCalledTimes(1);
    const [destinatarioId, datos] = notificarMock.mock.calls[0];
    expect(destinatarioId.toString()).toBe(superadmin._id.toString());
    expect(datos.mensaje).toContain('Interesado');
  });
});
