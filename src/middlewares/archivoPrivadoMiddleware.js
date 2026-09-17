import Entrega from '../models/Entrega.js';
import Curso from '../models/Curso.js';
import { CARPETA_PRIVADA } from '../config/almacenamiento.js';

// Hasta ahora el único productor de archivos "privado: true" es entregaController
// (adjuntos de una entrega). Si en el futuro otro tipo de archivo empieza a usar
// { privado: true }, este middleware también debe aprender a reconocerlo -- si
// no, los va a bloquear (falla cerrado, no abierto).
//
// Antes, /uploads/priv/... solo pedía sesión válida (authMiddleware): cualquier
// padre o docente logueado -- de cualquier institución -- que se enterara de la
// URL de un archivo (viejo historial del navegador, una captura compartida, etc.)
// podía descargarlo, sin importar si la entrega era suya. La API de entregas
// (canViewEntrega) ya limitaba correctamente quién *ve* esa URL; esto cierra el
// mismo hueco a nivel del archivo servido directamente.
export const verificarAccesoArchivoPrivado = async (req, res, next) => {
  try {
    const { userId, rol: userRole, institucionId } = req.user;
    const publicId = `${CARPETA_PRIVADA}${req.path}`; // req.path ya empieza en "/"

    const entrega = await Entrega.findOne({ 'archivosAdjuntos.publicId': publicId })
      .populate({ path: 'tareaId', select: 'docenteId cursoId' })
      .lean();

    if (!entrega) {
      return res.status(404).json({ message: 'Archivo no encontrado' });
    }

    if (entrega.padreId.toString() === userId) return next();
    if (entrega.tareaId?.docenteId?.toString() === userId) return next();
    if (userRole === 'superadmin') return next();

    if (userRole === 'administrador') {
      const curso = await Curso.findById(entrega.tareaId?.cursoId).select('institucionId').lean();
      if (curso && curso.institucionId.toString() === institucionId) return next();
    }

    return res.status(403).json({ message: 'No tienes permiso para ver este archivo' });
  } catch (error) {
    console.error('Error en verificarAccesoArchivoPrivado:', error);
    return res.status(500).json({ message: 'Error al verificar permisos para ver el archivo' });
  }
};
