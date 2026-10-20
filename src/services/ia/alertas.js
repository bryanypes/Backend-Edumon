import mongoose from 'mongoose';
import AlertaRiesgo from '../../models/AlertaRiesgo.js';
import Institucion from '../../models/Institucion.js';
import Curso from '../../models/Curso.js';
import User from '../../models/User.js';
import notificador from '../../notifications/NotificadorFacade.js';
import { encadenar } from './bitacora.js';

export const ETIQUETAS_CATEGORIA = {
  maltrato_fisico: 'maltrato físico',
  maltrato_psicologico: 'maltrato psicológico',
  abuso_sexual: 'abuso sexual',
  violencia_intrafamiliar: 'violencia intrafamiliar',
  autolesion_suicidio: 'riesgo de autolesión o suicidio',
  negligencia_grave: 'negligencia grave',
};

// responsable de convivencia si está designado y activo; si no, el admin del colegio
export async function resolverDestinatario(institucionId) {
  const institucion = await Institucion.findById(institucionId)
    .select('responsableConvivenciaId adminId')
    .lean();
  if (!institucion) return null;

  if (institucion.responsableConvivenciaId) {
    const responsable = await User.findOne({
      _id: institucion.responsableConvivenciaId,
      estado: 'activo',
    }).select('_id').lean();
    if (responsable) return responsable._id;
  }
  return institucion.adminId || null;
}

// docentes activos de los cursos (activos) donde participa la familia
export async function resolverDocentesDeLaFamilia(usuarioId, institucionId) {
  const docentesIds = await Curso.find({
    institucionId,
    estado: 'activo',
    'participantes.usuarioId': usuarioId,
  }).distinct('docenteId');
  if (!docentesIds.length) return [];

  return User.find({ _id: { $in: docentesIds }, rol: 'docente', estado: 'activo' }).distinct('_id');
}

// el padre no tiene institución propia: queda ligado a las instituciones de los
// cursos donde participa (ver userController.getUsers)
export async function institucionesDeLaFamilia(usuarioId, institucionId) {
  if (institucionId) return [institucionId];
  return Curso.find({ 'participantes.usuarioId': usuarioId, estado: 'activo' }).distinct('institucionId');
}

const textoAviso = ({ categoria, origen, ambito }) => (origen === 'solicitada'
  ? `Una familia de tu ${ambito} pidió apoyo a través de Edumon por una situación de ${ETIQUETAS_CATEGORIA[categoria]}. Contáctala pronto.`
  : `Edumon detectó una posible situación de ${ETIQUETAS_CATEGORIA[categoria]} en una familia de tu ${ambito}. Abre la alerta para ver qué hacer.`);

/**
 * Crea la alerta y notifica al responsable de convivencia (o al admin) y a los
 * docentes de los cursos de esa familia. Una sola alerta abierta por
 * conversación y categoría: si la familia sigue escribiendo del mismo tema no se repite.
 */
export async function crearAlertaRiesgo({ conversacion, categoria, mensajeDisparador, origen = 'automatica', deteccion = null }) {
  const instituciones = await institucionesDeLaFamilia(conversacion.usuarioId, conversacion.institucionId);
  if (!instituciones.length) {
    console.error('[Edumon] Riesgo detectado en una familia sin cursos ni institución: no hay a quién alertar');
    return null;
  }

  // una alerta por institución (casi siempre es una sola)
  const alertas = [];
  for (const institucionId of instituciones) {
    const abierta = await AlertaRiesgo.findOne({
      conversacionId: conversacion._id,
      institucionId,
      categoria,
      estado: { $ne: 'cerrada' },
    }).lean();
    if (abierta) { alertas.push(abierta); continue; }

    const [notificadoA, docentesCurso] = await Promise.all([
      resolverDestinatario(institucionId),
      resolverDocentesDeLaFamilia(conversacion.usuarioId, institucionId),
    ]);

    // el _id se fija antes de crearla porque el primer hash de la bitácora lo incluye
    const datos = {
      _id: new mongoose.Types.ObjectId(),
      institucionId,
      usuarioId: conversacion.usuarioId,
      perfilId: conversacion.perfilId,
      conversacionId: conversacion._id,
      categoria,
      origen,
      mensajeDisparador,
      notificadoA,
      docentesCurso,
      deteccion,
    };
    const alerta = new AlertaRiesgo(datos);
    alerta.historial = encadenar(alerta, [], [{
      accion: 'creada',
      estado: 'nueva',
      por: origen === 'solicitada' ? conversacion.usuarioId : null,
      nota: origen === 'solicitada' ? 'La familia pidió que la contactaran.' : 'Edumon detectó un posible riesgo grave.',
    }]);
    await alerta.save();

    // el aviso no lleva el nombre de la familia: el push y el correo pueden
    // verse en pantallas ajenas; el detalle está en la alerta (con sesión)
    const destinatarios = [...new Set([notificadoA, ...docentesCurso].filter(Boolean).map(String))];
    await Promise.all(destinatarios.map((usuarioId) => notificador.notificar(usuarioId, {
      tipo: 'alerta_ia',
      mensaje: textoAviso({ categoria, origen, ambito: usuarioId === String(notificadoA) ? 'institución' : 'curso' }),
      prioridad: 'critica',
      referenciaId: alerta._id,
      referenciaModelo: 'AlertaRiesgo',
      metadata: { categoria, origen },
    })));
    alertas.push(alerta);
  }

  return alertas[0];
}
