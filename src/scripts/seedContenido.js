import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import Institucion from '../models/Institucion.js';
import User from '../models/User.js';
import Curso from '../models/Curso.js';
import Modulo from '../models/Modulo.js';
import Tarea from '../models/Tarea.js';
import Entrega from '../models/Entrega.js';
import Foro from '../models/Foro.js';
import MensajeForo from '../models/MensajeForo.js';
import Evento from '../models/Evento.js';
import AsistenciaEncuentro from '../models/AsistenciaEncuentro.js';
import Notificacion from '../models/Notificacion.js';
import PerfilFamiliar from '../models/PerfilFamiliar.js';
import { subirArchivoCloudinary, eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { NIT_DEMO, DOMINIO_DEMO } from './seedDemo.js';

const IMAGENES = fileURLToPath(new URL('../data/demo-imagenes/', import.meta.url));
const ETIQUETA = 'demo-contenido';
const DIA = 24 * 60 * 60 * 1000;
const dias = (n, hora = 18) => {
  const d = new Date(Date.now() + n * DIA);
  d.setHours(hora, 0, 0, 0);
  return d;
};
const TIPOS_NOTIFICACION = ['tarea', 'entrega', 'calificacion', 'foro', 'evento'];

export async function limpiarContenido({ institucionId, cursosIds = [], usuariosIds = [] }) {
  const tareas = await Tarea.find({ cursoId: { $in: cursosIds } }).select('_id').lean();
  const entregas = await Entrega.find({ tareaId: { $in: tareas.map((t) => t._id) } }).select('archivosAdjuntos').lean();
  const foros = await Foro.find({ cursoId: { $in: cursosIds } }).select('archivos').lean();
  const mensajes = await MensajeForo.find({ foroId: { $in: foros.map((f) => f._id) } }).select('archivos').lean();
  const eventos = await Evento.find({ cursosIds: { $in: cursosIds } }).select('imagenPortada').lean();
  const cursos = await Curso.find({ _id: { $in: cursosIds } }).select('fotoPortadaPublicId').lean();

  const archivos = [
    ...entregas.flatMap((e) => e.archivosAdjuntos.map((a) => a.publicId)),
    ...foros.flatMap((f) => f.archivos.map((a) => a.publicId)),
    ...mensajes.flatMap((m) => m.archivos.map((a) => a.publicId)),
    ...eventos.map((e) => e.imagenPortada?.publicId),
    ...cursos.map((c) => c.fotoPortadaPublicId),
  ].filter(Boolean);
  await Promise.all(archivos.map((id) => eliminarArchivoCloudinary(id).catch(() => null)));

  await Promise.all([
    Entrega.deleteMany({ _id: { $in: entregas.map((e) => e._id) } }),
    MensajeForo.deleteMany({ foroId: { $in: foros.map((f) => f._id) } }),
    Foro.deleteMany({ _id: { $in: foros.map((f) => f._id) } }),
    Evento.deleteMany({ _id: { $in: eventos.map((e) => e._id) } }),
    institucionId ? AsistenciaEncuentro.deleteMany({ institucionId }) : null,
    Notificacion.deleteMany({ usuarioId: { $in: usuariosIds }, tipo: { $in: TIPOS_NOTIFICACION } }),
    PerfilFamiliar.deleteMany({ titularId: { $in: usuariosIds } }),
    Tarea.deleteMany({ cursoId: { $in: cursosIds }, etiquetas: ETIQUETA }),
    Curso.updateMany({ _id: { $in: cursosIds } }, { $set: { fotoPortadaUrl: null, fotoPortadaPublicId: null, color: null } }),
  ]);
  const modulosConRetos = await Tarea.find({ cursoId: { $in: cursosIds } }).distinct('moduloId');
  await Modulo.deleteMany({ cursoId: { $in: cursosIds }, _id: { $nin: modulosConRetos } });
}

async function guardarImagen(nombre, { carpeta, privado = false, nombreOriginal }) {
  const buffer = await fs.readFile(path.join(IMAGENES, `${nombre}.jpg`));
  const r = await subirArchivoCloudinary(buffer, 'image/jpeg', carpeta, nombreOriginal ?? `${nombre}.jpg`, { privado });
  return { ...r, tamano: buffer.length };
}

const OTROS_PERFILES = [
  [], ['Abuela Rosa'], ['Andrés'], [], ['Tía Marta', 'Abuelo Luis'],
  ['Paola'], [], ['Abuela Carmen'], ['Jorge'], ['Tío Felipe'],
];

const CURSOS = {
  'Grado Quinto A': {
    portada: 'curso-quinto', color: '#0C6AC4',
    descripcion: 'Familias de Quinto A acompañando el último año de primaria: rutinas, estudio en casa, emociones y uso responsable de pantallas.',
    modulos: [
      ['Hábitos y rutinas en casa', 'Retos para organizar las mañanas, las tardes de tareas y las noches sin afanes.'],
      ['Emociones en familia', 'Retos para reconocer, nombrar y acompañar lo que sentimos en casa.'],
    ],
    retos: [
      {
        titulo: 'Rutina de la mañana sin afanes', modulo: 'Hábitos y rutinas en casa', tipoEntrega: 'archivo', dias: -25, cerrado: true,
        escuelaPadres: { eje: 'apoyo_procesos_educativos', subtema: 'rutinas_organizacion' },
        descripcion: '<p>Las mañanas con afán empiezan el día con estrés para todos. Esta semana vamos a construir con nuestros hijos una rutina visual.</p><ol><li>Hagan juntos un cartel con los pasos de la mañana, con dibujos.</li><li>Péguenlo en un lugar visible.</li><li>Dejen la ropa y la maleta listas desde la noche anterior.</li><li>Cuenten cuántos días llegaron a tiempo y sin gritos.</li></ol>',
        criterios: '<ul><li>Foto del cartel de la rutina</li><li>Reflexión corta: ¿qué cambió en las mañanas?</li></ul>',
        imagenes: ['rutina-manana-1', 'rutina-manana-2', 'rutina-manana-3'], participacion: 6,
      },
      {
        titulo: 'Horario y lugar fijo para las tareas', modulo: 'Hábitos y rutinas en casa', tipoEntrega: 'archivo', dias: -12, cerrado: true,
        escuelaPadres: { eje: 'apoyo_procesos_educativos', subtema: 'tareas_estudio' },
        descripcion: '<p>Acompañar las tareas no es hacerlas por ellos. Esta semana definan juntos un horario y un lugar fijo para estudiar, sin televisión ni celular cerca.</p><ol><li>Escojan el lugar y la hora con su hijo o hija.</li><li>Hagan el horario de la semana en una hoja.</li><li>Pregunten cada día: ¿qué fue lo más interesante que aprendiste hoy?</li></ol>',
        criterios: '<ul><li>Foto del horario</li><li>¿Qué fue lo más difícil de cumplir?</li></ul>',
        imagenes: ['horario-tareas-1', 'horario-tareas-2'], participacion: 5,
      },
      {
        titulo: 'Diario de emociones de la semana', modulo: 'Emociones en familia', tipoEntrega: 'multimedia', dias: 3, cerrado: false,
        escuelaPadres: { eje: 'crianza_amorosa', subtema: 'emociones' },
        descripcion: '<p>Ponerle nombre a lo que sentimos ayuda a manejarlo. Durante siete días, cada noche, pregúntenle a su hijo cómo se sintió y dibujen juntos la carita del día.</p><ol><li>Usen una hoja con los días de la semana.</li><li>Si hubo un día difícil, hablen de qué pasó sin regañar.</li><li>Al final de la semana miren juntos el diario.</li></ol>',
        criterios: '<ul><li>Foto del diario</li><li>¿Qué emoción apareció más?</li></ul>',
        imagenes: ['diario-emociones-1', 'diario-emociones-2', 'familia-juntos-1'], participacion: 4, calificadas: 2,
      },
      {
        titulo: 'Rutina antes de dormir', modulo: 'Hábitos y rutinas en casa', tipoEntrega: 'archivo', dias: 12, cerrado: false,
        escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'sueno' },
        descripcion: '<p>Dormir bien mejora la atención y el ánimo. Esta semana armen una rutina de 4 o 5 pasos antes de dormir y apaguen las pantallas una hora antes.</p>',
        criterios: '<ul><li>Foto de la rutina</li><li>¿A qué hora se durmió en promedio?</li></ul>',
        imagenes: ['rutina-noche-1'], participacion: 1, calificadas: 0,
      },
    ],
    retoBase: { imagenes: ['acuerdos-pantallas-1', 'acuerdos-pantallas-2', 'acuerdos-pantallas-3'], participacion: 5, calificadas: 3 },
    foros: [
      {
        titulo: 'Bienvenidas: familias de Quinto A', descripcion: 'Un espacio para presentarnos y conocernos. Cuéntennos quiénes son y qué esperan de este año.',
        mensajes: [
          ['docente', '¡Bienvenidas, familias! Soy el profe Andrés, director de grupo. Este año vamos a trabajar juntos la escuela de padres con retos cortos para hacer en casa. Cualquier duda, por aquí o por el buzón.'],
          [0, 'Hola a todos, soy Laura, mamá de Santiago. Muy contenta de empezar este año. Santi está emocionado porque es su último año de primaria.', 3],
          [1, 'Buenas tardes. Carlos, papá de Sofía. Nos interesa mucho el tema de las pantallas, en la casa nos cuesta bastante.', 2, 'r:0'],
          ['docente', 'Carlos, justo el primer módulo es sobre eso. Esta semana publicamos el reto de los acuerdos de pantallas.', 1, 'r:2'],
          [2, 'Hola, soy Natalia, mamá de Mateo. Gracias profe por la bienvenida.', 1],
        ],
      },
      {
        titulo: 'Ideas para que las mañanas fluyan', descripcion: 'Compartan lo que les ha funcionado del reto de la rutina de la mañana. Pueden subir fotos de sus carteles.',
        imagen: 'foro-cartelera',
        mensajes: [
          [3, 'A nosotros nos funcionó dejar la ropa sobre la silla desde la noche. Ya no peleamos por qué ponerse.', 4],
          [4, 'Nosotros pusimos música mientras desayunamos, a Valentina le encanta y se apura sola.', 3],
          [0, 'Muy buena idea la música, la vamos a probar.', 1, 'r:1'],
          ['docente', 'Qué bonito ver cómo cada familia encontró su forma. Recuerden que los cambios toman unas semanas: no se desanimen si un día sale mal.', 5],
        ],
      },
    ],
    eventos: [
      { titulo: 'Escuela de padres: rutinas que sí funcionan', categoria: 'escuela_padres', dias: -20, hora: '18:00', ubicacion: 'Aula múltiple, sede principal', portada: 'evento-escuela-padres', asistencia: 6, escuelaPadres: { eje: 'apoyo_procesos_educativos', subtema: 'rutinas_organizacion' }, descripcion: 'Encuentro presencial de escuela de padres sobre rutinas en casa y acompañamiento de tareas. Compartiremos lo que funcionó en los retos.' },
      { titulo: 'Taller: pantallas en casa, acuerdos que funcionan', categoria: 'escuela_padres', dias: 6, hora: '18:30', ubicacion: 'Biblioteca del colegio', portada: 'evento-pantallas', escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'pantallas' }, descripcion: 'Taller práctico para acordar tiempos de pantalla en familia, cuidar la seguridad en internet y evitar peleas por el celular.' },
    ],
  },
  'Grado Tercero B': {
    portada: 'curso-tercero', color: '#F23D7F',
    descripcion: 'Familias de Tercero B: crianza respetuosa, alimentación saludable y convivencia sin acoso.',
    modulos: [
      ['Crianza respetuosa', 'Retos para acompañar a los hijos con afecto, límites claros y sin golpes ni gritos.'],
      ['Alimentación saludable', 'Retos para crear hábitos de alimentación en familia, sin peleas a la hora de comer.'],
      ['Convivencia y prevención del acoso', 'Retos para prevenir el matoneo y saber cómo actuar si pasa.'],
    ],
    retos: [
      {
        titulo: 'Un rincón de la calma en casa', modulo: 'Crianza respetuosa', tipoEntrega: 'archivo', dias: -18, cerrado: true,
        escuelaPadres: { eje: 'crianza_amorosa', subtema: 'rabietas' },
        descripcion: '<p>Las rabietas son una forma de pedir ayuda con emociones muy grandes. Esta semana van a crear con su hijo un rincón de la calma: un lugar tranquilo con cojines, un peluche y pasos para calmarse.</p><ol><li>Escojan juntos el lugar.</li><li>Hagan un cartel con 3 o 4 pasos para calmarse.</li><li>Practíquenlo cuando estén tranquilos, no solo en medio de la rabieta.</li></ol>',
        criterios: '<ul><li>Foto del rincón o del cartel</li><li>¿Lo usó alguna vez durante la semana?</li></ul>',
        imagenes: ['rincon-calma-1', 'rincon-calma-2', 'familia-juntos-2'], participacion: 6,
      },
      {
        titulo: 'Lonchera saludable de la semana', modulo: 'Alimentación saludable', tipoEntrega: 'archivo', dias: -6, cerrado: true,
        escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'alimentacion' },
        descripcion: '<p>Planeen juntos la lonchera de lunes a viernes. Dejen que su hijo escoja la fruta de cada día entre dos opciones.</p>',
        criterios: '<ul><li>Foto del plan de la semana</li><li>¿Qué alimento nuevo probó?</li></ul>',
        imagenes: ['lonchera-1', 'lonchera-2'], participacion: 5,
      },
      {
        titulo: 'Mis adultos de confianza', modulo: 'Convivencia y prevención del acoso', tipoEntrega: 'archivo', dias: 5, cerrado: false,
        escuelaPadres: { eje: 'garantia_derechos', subtema: 'derechos_proteccion' },
        descripcion: '<p>Que los niños sepan a quién acudir es la mejor protección. Dibujen la mano de su hijo y en cada dedo escriban un adulto de confianza, en casa y en el colegio.</p>',
        criterios: '<ul><li>Foto de la mano de confianza</li><li>¿Qué le dijo su hijo sobre a quién acudir?</li></ul>',
        imagenes: ['adultos-confianza-1', 'adultos-confianza-2'], participacion: 3, calificadas: 1,
      },
      {
        titulo: 'Una semana elogiando el esfuerzo', modulo: 'Crianza respetuosa', tipoEntrega: 'texto', dias: 15, cerrado: false,
        escuelaPadres: { eje: 'crianza_amorosa', subtema: 'disciplina_positiva' },
        descripcion: '<p>Durante una semana, cada día, elogien algo que su hijo hizo con esfuerzo (no solo los resultados). Anoten qué dijeron y cómo reaccionó.</p>',
        criterios: '<ul><li>Reflexión escrita: ¿qué cambió en el ambiente de la casa?</li></ul>',
        imagenes: [], participacion: 0,
      },
    ],
    foros: [
      {
        titulo: '¿Qué ponen en la lonchera? Compartamos ideas', descripcion: 'Ideas económicas y saludables para la lonchera de la semana.',
        mensajes: [
          [1, 'En la casa hacemos arepa pequeña con queso y una fruta. Es barato y a Juanita le gusta.', 4],
          [2, 'Nosotros cambiamos el jugo de caja por agua con limón y panela. Al principio no le gustó pero ya se acostumbró.', 3],
          [3, '¿Alguien tiene ideas para un niño que no come fruta? El mío la devuelve entera.', 1],
          ['docente', 'Una idea que ha funcionado: que él mismo la escoja y la pique con ustedes. Cuando participan, la comen más.', 4, 'r:2'],
          [3, 'Gracias profe, lo vamos a intentar este fin de semana.', 1, 'r:3'],
        ],
      },
    ],
    eventos: [
      { titulo: 'Escuela de padres: rabietas y límites con amor', categoria: 'escuela_padres', dias: -10, hora: '17:30', ubicacion: 'Salón 3B', portada: 'evento-escuela-padres', asistencia: 5, escuelaPadres: { eje: 'crianza_amorosa', subtema: 'rabietas' }, descripcion: 'Encuentro de escuela de padres sobre cómo acompañar las rabietas sin gritos ni castigos físicos, con ejemplos prácticos.' },
      { titulo: 'Día de la familia', categoria: 'institucional', dias: 20, hora: '09:00', ubicacion: 'Cancha principal', portada: 'evento-feria', descripcion: 'Jornada de integración con juegos, comida típica y talleres para toda la familia. ¡Los esperamos!' },
    ],
  },
  'Grado Noveno A': {
    portada: 'curso-noveno', color: '#14B8A6',
    descripcion: 'Familias de Noveno A acompañando la adolescencia: comunicación, límites, salidas y prevención del consumo.',
    modulos: [
      ['Comunicación con adolescentes', 'Retos para mantener la confianza y la conversación en la adolescencia.'],
      ['Prevención del consumo', 'Retos para hablar de alcohol, cigarrillo y vapeadores sin sermones.'],
      ['Límites y acuerdos', 'Retos para acordar normas de salidas, permisos y uso del celular.'],
    ],
    retos: [
      {
        titulo: 'Carta a mi hijo o hija', modulo: 'Comunicación con adolescentes', tipoEntrega: 'archivo', dias: -20, cerrado: true,
        escuelaPadres: { eje: 'crianza_amorosa', subtema: 'comunicacion_adolescentes' },
        descripcion: '<p>A veces lo más importante es difícil de decir en voz alta. Escríbanle una carta a su hijo o hija contándole lo que admiran de él o ella y lo que quieren mejorar como familia. Entréguensela en un momento tranquilo.</p>',
        criterios: '<ul><li>Foto de la carta (pueden tapar lo que sea privado)</li><li>¿Cómo reaccionó al leerla?</li></ul>',
        imagenes: ['carta-familia-1', 'carta-familia-2'], participacion: 5,
      },
      {
        titulo: 'Acuerdos de salidas y permisos', modulo: 'Límites y acuerdos', tipoEntrega: 'archivo', dias: -4, cerrado: true,
        escuelaPadres: { eje: 'crianza_amorosa', subtema: 'limites' },
        descripcion: '<p>Los adolescentes cumplen mejor las normas que ayudaron a construir. Siéntense a acordar juntos las reglas de salidas, horarios y qué hacer si algo sale mal.</p>',
        criterios: '<ul><li>Foto de los acuerdos firmados por todos</li><li>¿En qué no estuvieron de acuerdo y cómo lo resolvieron?</li></ul>',
        imagenes: ['acuerdos-salidas-1', 'acuerdos-salidas-2'], participacion: 4,
      },
      {
        titulo: 'Una conversación sobre alcohol y vapeadores', modulo: 'Prevención del consumo', tipoEntrega: 'texto', dias: 7, cerrado: false,
        escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'consumo_sustancias' },
        descripcion: '<p>Busquen un momento tranquilo (en el carro, cocinando) para preguntarle qué piensa del alcohol y los vapeadores. Escuchen más de lo que hablan y eviten el sermón.</p>',
        criterios: '<ul><li>Reflexión: ¿qué les sorprendió de lo que dijo?</li></ul>',
        imagenes: [], participacion: 3, calificadas: 1,
      },
      {
        titulo: 'Cenas sin pantallas', modulo: 'Límites y acuerdos', tipoEntrega: 'archivo', dias: 14, cerrado: false,
        escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'pantallas' },
        descripcion: '<p>Durante una semana, cenen sin celulares en la mesa (adultos incluidos). Marquen en un cartel los días que lo lograron.</p>',
        criterios: '<ul><li>Foto del cartel de la semana</li><li>¿De qué hablaron en las cenas?</li></ul>',
        imagenes: ['cena-sin-pantallas-1', 'cena-sin-pantallas-2'], participacion: 2, calificadas: 0,
      },
    ],
    foros: [
      {
        titulo: 'Adolescencia: ¿cómo lograr que nos cuenten sus cosas?', descripcion: 'Compartamos experiencias y dudas sobre la comunicación con nuestros hijos adolescentes.',
        mensajes: [
          ['docente', 'Este foro es para apoyarnos entre familias. Una pregunta para empezar: ¿en qué momentos del día su hijo o hija conversa más?'],
          [0, 'En el carro. Cuando no lo miro a los ojos me cuenta más cosas, es curioso.', 5, 'r:0'],
          [1, 'A nosotros nos pasa en la noche, tarde. Si le pregunto apenas llega del colegio, me contesta "bien" y ya.', 3, 'r:0'],
          [2, 'La carta del reto nos ayudó mucho. Mi hija lloró y después hablamos casi una hora.', 6],
          ['docente', 'Qué valioso lo que cuentan. No se trata de hablar más, sino de estar disponibles cuando ellos quieren hablar.', 4, 'r:3'],
        ],
      },
    ],
    eventos: [
      { titulo: 'Escuela de padres: hablemos de consumo', categoria: 'escuela_padres', dias: -15, hora: '18:00', ubicacion: 'Auditorio y transmisión virtual', portada: 'evento-escuela-padres', asistencia: 4, virtual: true, escuelaPadres: { eje: 'estilos_vida_saludable', subtema: 'consumo_sustancias' }, descripcion: 'Encuentro con orientación escolar sobre prevención del consumo de alcohol y vapeadores en adolescentes.' },
    ],
  },
};

const REFLEXIONES = {
  'Rutina de la mañana sin afanes': [
    'Hicimos el cartel con Santi y lo pegamos en la puerta del cuarto. Las primeras mañanas igual tocó recordarle, pero el jueves y el viernes se alistó solo. Lo que más ayudó fue dejar la ropa lista la noche anterior.',
    'Al principio Sofía no quería, pero cuando la dejamos escoger los dibujos se emocionó. Llegamos a tiempo 4 de 5 días, y lo mejor: sin gritos.',
    'Nos dimos cuenta de que el que se demoraba era yo con el celular. Ahora desayunamos juntos sin pantallas y salimos más tranquilos.',
    'Funcionó a medias. El lunes fue un caos, pero desde el miércoles ya seguía los pasos. Vamos a seguir con el cartel.',
    'La maleta lista desde la noche fue la clave. Antes siempre se nos olvidaba algo y salíamos corriendo.',
    'Mi hijo dice que ahora se siente "grande" porque hace todo solo. Fue muy bonito verlo orgulloso.',
  ],
  'Horario y lugar fijo para las tareas': [
    'Escogimos la mesa del comedor de 3 a 4. Lo más difícil fue apagar el televisor de la sala, pero lo logramos casi toda la semana.',
    'Le pregunté cada día qué fue lo más interesante que aprendió. El martes me explicó los planetas por media hora, no sabía que le gustaba tanto.',
    'Nos costó cumplir el horario los días que yo llegaba tarde del trabajo. La abuela nos ayudó a sostenerlo.',
    'Antes yo le hacía parte de la tarea para terminar rápido. Esta semana solo lo acompañé y la hizo él, se demoró más pero aprendió más.',
    'El horario quedó pegado en la nevera. Ahora él mismo me recuerda la hora de las tareas.',
  ],
  'Diario de emociones de la semana': [
    'El diario nos sirvió para hablar del día que perdió el partido. Antes se encerraba y ya; esta vez me contó que se sintió triste y que no quería que lo regañaran.',
    'Aprendimos a ponerle nombre a lo que sentimos. Ella dice "hoy estoy brava" en vez de tirar las cosas.',
    'Lo hicimos en familia y yo también dibujé mis caritas. Mi hija se sorprendió de que los papás también nos ponemos tristes.',
    'Fue difícil sacar el tiempo todas las noches, lo hicimos 5 de 7 días. Igual vamos a seguir.',
  ],
  'Rutina antes de dormir': [
    'Armamos la rutina con 5 pasos. Ya se duerme a las 9 y no a las 10:30 como antes.',
  ],
  'Reto: una hora sin pantallas en familia': [
    'Hicimos los acuerdos en familia y los firmamos todos. El que más trabajo le costó fui yo, la verdad.',
    'La primera tarde sin pantallas jugamos parqués y Sofía no quería parar. Vamos a repetirlo los domingos.',
    'Dejamos el celular durmiendo en la sala. Al principio protestó, ahora se duerme más temprano.',
    'Cumplimos la hora sin pantallas 5 de 7 días. Salimos al parque y volvimos a montar bicicleta.',
    'Nos sirvió mucho poner las reglas por escrito: ya no es "porque yo digo", es lo que acordamos.',
  ],
  'Un rincón de la calma en casa': [
    'Armamos el rincón con cojines y su peluche favorito. El miércoles tuvo una rabieta y ella misma se fue al rincón. ¡No lo podía creer!',
    'Le costó al principio, pero practicar la respiración del globo cuando está tranquilo ayudó mucho.',
    'Nos dimos cuenta de que las rabietas eran más fuertes cuando tenía hambre o sueño. Cambiamos el horario de la merienda.',
    'Yo también uso el rincón cuando estoy por perder la paciencia. Mi hijo me dice "mamá, ve al rincón" y nos reímos.',
    'Funcionó dos veces de cuatro. Seguimos practicando.',
    'Lo más importante fue dejar de gritar nosotros. Él se calma más rápido cuando le hablamos bajito.',
  ],
  'Lonchera saludable de la semana': [
    'Emma escogió la fruta de cada día y se la comió toda, cosa que antes no pasaba.',
    'Cambiamos el jugo de caja por fruta y agua. Además nos ahorramos plata.',
    'Probó la zanahoria en palitos y le gustó. No esperábamos eso.',
    'Planear la semana el domingo nos quitó el estrés de la mañana.',
    'Nos costó con el pan, pide pan dulce todos los días. Lo dejamos para el viernes.',
  ],
  'Mis adultos de confianza': [
    'Dibujamos la mano y puso a la profe Paola. Le pregunté por qué y dijo que porque lo escucha.',
    'Nos sirvió para hablar de qué hacer si alguien la trata mal. Ella sabe que puede contarnos.',
    'Puso al abuelo en el dedo gordo, dice que es el más importante. Lo pegamos en la nevera.',
  ],
  'Carta a mi hijo o hija': [
    'Le entregué la carta un domingo en el desayuno. No dijo mucho, pero en la noche me abrazó y me dijo gracias. Para nosotros eso fue enorme.',
    'Mi hija lloró y después hablamos casi una hora. Hacía mucho no conversábamos así.',
    'Al principio se rio y dijo que era "muy cursi", pero la tiene pegada en su cuarto.',
    'Fue difícil escribirla, me di cuenta de que casi siempre le hablo para corregirlo. Quiero cambiar eso.',
    'La leímos juntos y acordamos un día a la semana para salir los dos solos.',
  ],
  'Acuerdos de salidas y permisos': [
    'Discutimos la hora de llegada: él quería las 10 y quedamos en las 9. Lo firmamos todos y hasta ahora lo ha cumplido.',
    'Lo más valioso fue acordar que si algo sale mal nos llama sin miedo a que lo regañemos.',
    'Al principio se negaba a hablar, pero cuando vio que también podía proponer, participó.',
    'Ya habíamos tenido problemas con una fiesta. Escribir los acuerdos nos ayudó a no repetir la pelea.',
  ],
  'Una conversación sobre alcohol y vapeadores': [
    'Hablamos en el carro camino al colegio. Me sorprendió que varios compañeros ya usan vapeador y que él piensa que "no hace daño". Buscamos información juntos.',
    'Me contó que en una fiesta le ofrecieron cerveza y dijo que no. Le agradecí que me lo contara.',
    'Me costó no sermonear. Cuando me callé y escuché, me contó más de lo que esperaba.',
  ],
  'Cenas sin pantallas': [
    'Lo logramos 5 de 7 días. El que más extrañaba el celular era el papá.',
    'Hablamos de lo mejor de nuestro día cada noche. Descubrimos que a nuestra hija le está yendo muy bien en dibujo.',
  ],
};

const COMENTARIOS = [
  [5, '¡Excelente trabajo en familia! Se nota el compromiso y la reflexión es muy honesta. Sigan así.'],
  [5, 'Qué bonito lo que cuentan. Gracias por compartirlo con el grupo.'],
  [4, 'Muy buen avance. Recuerden que los cambios toman unas semanas, no se desanimen.'],
  [4, 'Buen trabajo. Me gustaría que en la próxima entrega nos cuenten un poco más de cómo se sintió su hijo.'],
  [5, 'Gracias por la honestidad. Reconocer lo que nos cuesta como adultos es el primer paso.'],
  [3, 'Gracias por participar. Les animo a intentarlo de nuevo esta semana con los ajustes que mencionan.'],
];

const PRIMER_NOMBRE = (u) => u.nombre.split(' ')[0];

export async function sembrarContenido({ log = console.log } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Abortado: NODE_ENV=production. El seed de contenido es solo para la demo.');

  const inst = await Institucion.findOne({ nit: NIT_DEMO }).lean();
  if (!inst) throw new Error('No existe la demo base. Corre primero: npm run seed:demo');
  const cursos = await Curso.find({ institucionId: inst._id }).lean();
  const usuariosDemo = await User.find({ correo: { $regex: `${DOMINIO_DEMO.replace(/\./g, '\\.')}$` } }).lean();
  await limpiarContenido({ institucionId: inst._id, cursosIds: cursos.map((c) => c._id), usuariosIds: usuariosDemo.map((u) => u._id) });

  const porId = new Map(usuariosDemo.map((u) => [String(u._id), u]));
  const notificaciones = [];
  const notificar = (usuarioId, tipo, mensaje, fecha, referenciaId, referenciaModelo, leido = fecha < dias(-2)) => {
    notificaciones.push({ usuarioId, tipo, mensaje: mensaje.slice(0, 480), fecha, leido, referenciaId, referenciaModelo, prioridad: tipo === 'calificacion' ? 'media' : 'baja' });
  };

  const familias = usuariosDemo.filter((u) => u.rol === 'padre').sort((a, b) => a.telefono.localeCompare(b.telefono));
  await PerfilFamiliar.insertMany(familias.flatMap((f, i) => [PRIMER_NOMBRE(f), ...OTROS_PERFILES[i % OTROS_PERFILES.length]].map((nombre) => ({
    titularId: f._id,
    nombre,
    avatarUrl: f.fotoPerfilUrl ?? null,
    activo: true,
  }))));

  const totales = { modulos: 0, retos: 0, entregas: 0, imagenes: 0, foros: 0, mensajes: 0, eventos: 0, asistencias: 0 };

  for (const curso of cursos) {
    const datos = CURSOS[curso.nombre];
    if (!datos) continue;
    const docente = porId.get(String(curso.docenteId));
    const familiasCurso = curso.participantes.filter((p) => p.etiqueta === 'padre').map((p) => porId.get(String(p.usuarioId))).filter(Boolean);

    const portada = await guardarImagen(datos.portada, { carpeta: 'cursos' });
    await Curso.updateOne({ _id: curso._id }, { $set: { fotoPortadaUrl: portada.url, fotoPortadaPublicId: portada.publicId, color: datos.color, descripcion: datos.descripcion } });

    const modulos = new Map((await Modulo.find({ cursoId: curso._id }).lean()).map((m) => [m.titulo, m]));
    for (const [titulo, descripcion] of datos.modulos) {
      modulos.set(titulo, await Modulo.create({ cursoId: curso._id, titulo, descripcion, estado: 'activo', fechaCreacion: dias(-40) }));
      totales.modulos += 1;
    }

    const retos = [];
    for (const r of datos.retos) {
      const publicado = dias(Math.min(r.dias - 9, -1), 8);
      const tarea = await Tarea.create({
        titulo: r.titulo, descripcion: r.descripcion, criterios: r.criterios, fechaEntrega: dias(r.dias, 23),
        fechaCreacion: publicado, docenteId: docente._id, cursoId: curso._id, moduloId: modulos.get(r.modulo)._id,
        tipoEntrega: r.tipoEntrega, estado: r.cerrado ? 'cerrada' : 'publicada', asignacionTipo: 'todos',
        escuelaPadres: r.escuelaPadres, etiquetas: [ETIQUETA],
      });
      retos.push({ tarea, ...r });
      totales.retos += 1;
      for (const f of familiasCurso) notificar(f._id, 'tarea', `Nuevo reto en ${curso.nombre}: ${r.titulo}`, publicado, tarea._id, 'Tarea');
    }
    if (datos.retoBase) {
      const base = await Tarea.findOne({ cursoId: curso._id, etiquetas: { $ne: ETIQUETA } });
      if (base) {
        await Modulo.updateOne({ _id: base.moduloId }, { $set: { descripcion: 'Retos para acordar tiempos de pantalla en familia y cuidar la seguridad en internet.' } });
        base.descripcion = '<p>Esta semana acuerden en familia una hora al día sin pantallas (adultos incluidos) y escriban los acuerdos en un cartel que firmen todos.</p><ol><li>Escojan la hora juntos.</li><li>Propongan qué hacer en ese tiempo: juegos, cocinar, salir.</li><li>Marquen los días que lo lograron.</li></ol>';
        base.criterios = '<ul><li>Foto de los acuerdos firmados</li><li>¿Qué hicieron en la hora sin pantallas?</li></ul>';
        base.tipoEntrega = 'archivo';
        await base.save();
        retos.push({ tarea: base, titulo: base.titulo, tipoEntrega: 'archivo', dias: 10, cerrado: false, ...datos.retoBase });
      }
    }

    let comentario = 0;
    for (const reto of retos) {
      const textos = REFLEXIONES[reto.titulo] ?? [];
      const participan = familiasCurso.slice(0, Math.min(reto.participacion, familiasCurso.length));
      const calificadas = reto.cerrado ? participan.length : (reto.calificadas ?? 0);
      const vence = reto.tarea.fechaEntrega.getTime();
      const inicio = vence - 9 * DIA;
      for (const [i, familia] of participan.entries()) {
        const tarde = reto.cerrado && i === participan.length - 1 && participan.length > 3;
        const momento = tarde ? new Date(vence + DIA * 0.6) : new Date(Math.min(inicio + DIA * (2 + i * 0.9), Date.now() - DIA * 0.2 * (i + 1)));
        const adjuntos = [];
        if (reto.imagenes?.length && reto.tipoEntrega !== 'texto') {
          const img = await guardarImagen(reto.imagenes[i % reto.imagenes.length], {
            carpeta: 'archivos-entregas', privado: true, nombreOriginal: `IMG_2026${String(1000 + i * 37 + totales.entregas)}.jpg`,
          });
          adjuntos.push({ url: img.url, publicId: img.publicId, nombreOriginal: `IMG_2026${String(1000 + i * 37 + totales.entregas)}.jpg`, tipoArchivo: 'image/jpeg', tamano: img.tamano, privado: true });
          totales.imagenes += 1;
        }
        const calificar = i < calificadas;
        const [valoracion, texto] = COMENTARIOS[comentario % COMENTARIOS.length];
        if (calificar) comentario += 1;
        const fechaCal = new Date(Math.min(momento.getTime() + DIA * 1.5, Date.now() - 3600 * 1000));
        const entrega = await Entrega.create({
          tareaId: reto.tarea._id, padreId: familia._id, fechaEntrega: momento,
          textoRespuesta: textos[i % Math.max(textos.length, 1)] ?? 'Hicimos el reto en familia esta semana.',
          archivosAdjuntos: adjuntos, estado: tarde ? 'tarde' : 'enviada',
          ...(calificar ? { calificacion: { valoracion, comentario: texto, fechaCalificacion: fechaCal, fechaUltimaModificacion: fechaCal, docenteId: docente._id } } : {}),
        });
        totales.entregas += 1;
        notificar(docente._id, 'entrega', `${familia.nombre} ${familia.apellido} entregó el reto "${reto.titulo}"`, momento, entrega._id, 'Entrega');
        if (calificar) notificar(familia._id, 'calificacion', `Tu entrega de "${reto.titulo}" fue calificada con ${valoracion} estrellas`, fechaCal, entrega._id, 'Entrega');
      }
    }

    for (const [fi, f] of datos.foros.entries()) {
      const archivosForo = [];
      if (f.imagen) {
        const img = await guardarImagen(f.imagen, { carpeta: 'foros' });
        archivosForo.push({ url: img.url, publicId: img.publicId, tipo: 'imagen', nombre: `${f.imagen}.jpg`, tamano: img.tamano });
      }
      const creado = dias(-30 + fi * 12, 9);
      const foro = await Foro.create({ titulo: f.titulo, descripcion: f.descripcion, docenteId: docente._id, cursoId: curso._id, archivos: archivosForo, estado: 'abierto', publico: true, fechaCreacion: creado });
      totales.foros += 1;
      const creados = [];
      for (const [mi, [quien, contenido, likes = 0, responde]] of f.mensajes.entries()) {
        const autor = quien === 'docente' ? docente : familiasCurso[quien % familiasCurso.length];
        const respuestaA = responde ? creados[Number(responde.slice(2))]?._id ?? null : null;
        const likedBy = familiasCurso.filter((x) => String(x._id) !== String(autor._id)).slice(0, likes).map((x) => x._id);
        const msg = await MensajeForo.create({ foroId: foro._id, usuarioId: autor._id, contenido, respuestaA, likes: likedBy.length, likedBy, fechaCreacion: new Date(creado.getTime() + (mi + 1) * 5 * 3600 * 1000) });
        creados.push(msg);
        totales.mensajes += 1;
        if (respuestaA) {
          const original = creados[Number(responde.slice(2))];
          if (String(original.usuarioId) !== String(autor._id)) notificar(original.usuarioId, 'foro', `${autor.nombre} respondió tu mensaje en "${f.titulo}"`, msg.fechaCreacion, foro._id, 'Foro');
        }
      }
    }

    for (const ev of datos.eventos) {
      const portadaEv = await guardarImagen(ev.portada, { carpeta: 'eventos' });
      const cursosIds = ev.categoria === 'institucional' ? cursos.map((c) => c._id) : [curso._id];
      const inicio = dias(ev.dias, Number(ev.hora.split(':')[0]));
      const evento = new Evento({
        titulo: ev.titulo, descripcion: ev.descripcion, fechaInicio: inicio, fechaFin: new Date(inicio.getTime() + 2 * 3600 * 1000),
        hora: ev.hora, ubicacion: ev.ubicacion, docenteId: docente._id, imagenPortada: { url: portadaEv.url, publicId: portadaEv.publicId },
        cursosIds, categoria: ev.categoria, estado: ev.dias < 0 ? 'finalizado' : 'programado', escuelaPadres: ev.escuelaPadres ?? null,
        fechaCreacion: dias(Math.min(ev.dias, 0) - 14, 10),
      });
      await evento.save({ validateBeforeSave: ev.dias >= 0 });
      totales.eventos += 1;
      const invitados = ev.categoria === 'institucional' ? familias : familiasCurso;
      for (const f of invitados) notificar(f._id, 'evento', `${ev.categoria === 'escuela_padres' ? 'Escuela de padres' : 'Evento'}: ${ev.titulo} · ${inicio.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}, ${ev.hora}`, dias(Math.min(ev.dias, 0) - 7, 10), evento._id, 'Evento');

      if (ev.asistencia) {
        const marcado = new Date(inicio.getTime() + 2.5 * 3600 * 1000);
        await AsistenciaEncuentro.insertMany(familiasCurso.map((f, i) => {
          const asistio = i < ev.asistencia;
          const modalidad = ev.virtual && i % 2 ? 'virtual' : 'presencial';
          return {
            eventoId: evento._id, cursoId: curso._id, institucionId: inst._id, usuarioId: f._id, asistio, modalidad,
            marcadoPor: docente._id, marcadoEn: marcado, historial: [{ asistio, modalidad, por: docente._id, en: marcado }],
          };
        }));
        totales.asistencias += familiasCurso.length;
      }
    }
  }

  await Notificacion.insertMany(notificaciones);
  log(`✅ Contenido de demo: ${totales.modulos} módulos, ${totales.retos} retos, ${totales.entregas} entregas (${totales.imagenes} fotos), ${totales.foros} foros con ${totales.mensajes} mensajes, ${totales.eventos} eventos, ${totales.asistencias} registros de asistencia, ${notificaciones.length} notificaciones`);
  return { ...totales, notificaciones: notificaciones.length };
}

const ejecutadoDirecto = process.argv[1]?.endsWith('seedContenido.js');
if (ejecutadoDirecto) {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await sembrarContenido();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
