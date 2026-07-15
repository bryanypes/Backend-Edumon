import express from 'express';
import { 
  // Endpoints Padre
  createEntrega, 
  getEntregasByPadreAndTarea,
  updateEntrega,
  enviarEntrega,
  deleteEntrega,
  eliminarArchivoEntrega,
  
  // Endpoints Docente
  getAllEntregas,
  getEntregasByTarea,
  getEntregasByPadre,
  calificarEntrega,
  
  // Compartido
  getEntregaById
} from '../controllers/entregaController.js';

import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import { 
  createEntregaValidator, 
  updateEntregaValidator,
  calificarEntregaValidator,
  entregaIdValidator 
} from '../middlewares/validators/entregaValidator.js';
import {
  canCreateEntrega,
  canModifyEntrega,
  canViewEntrega,
  canCalificarEntrega,
  filterEntregasForUser
} from '../middlewares/entregaAuthMiddleware.js';

import { uploadArchivoCloudinary } from '../middlewares/cloudinaryMiddleware.js';

const router = express.Router();

// Rutas para docentes

router.get(
  '/',
  authMiddleware,
  filterEntregasForUser,
  getAllEntregas
);

// Solo docente/administrador: a diferencia de /mis-entregas/:tareaId (que se filtra por
// req.user.userId), este endpoint no tenía ninguna verificación de propiedad, por lo que
// cualquier padre autenticado podía leer las entregas y calificaciones de cualquier tarea
// con solo conocer/adivinar el tareaId.
router.get(
  '/tarea/:tareaId',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  getEntregasByTarea
);

// Solo docente/administrador: sin este rol, cualquier padre autenticado podía pasar el
// padreId de otra familia y ver sus entregas/calificaciones.
router.get(
  '/padre/:padreId',
  authMiddleware,
  requireRole(['docente', 'administrador']),
  getEntregasByPadre
);

router.patch(
  '/:id/calificar',
  authMiddleware,
  calificarEntregaValidator,
  canCalificarEntrega,
  calificarEntrega
);

// Rutas para padres

router.post(
  '/',
  authMiddleware,
  uploadArchivoCloudinary.array('archivos', 5), // multer antes de los validators de body
  createEntregaValidator,
  canCreateEntrega,
  createEntrega
);

router.get(
  '/mis-entregas/:tareaId',
  authMiddleware,
  getEntregasByPadreAndTarea
);

// Solo en borrador
router.put(
  '/:id',
  authMiddleware,
  uploadArchivoCloudinary.array('archivos', 5),
  updateEntregaValidator,
  canModifyEntrega,
  updateEntrega
);

router.patch(
  '/:id/enviar',
  authMiddleware,
  canModifyEntrega,
  enviarEntrega
);

// Solo en borrador
router.delete(
  '/:id',
  authMiddleware,
  entregaIdValidator,
  canModifyEntrega,
  deleteEntrega
);

router.delete(
  '/:id/archivos/:archivoId',
  authMiddleware,
  canModifyEntrega,
  eliminarArchivoEntrega
);

// Rutas compartidas — accesible por padre dueño, docente de la tarea o admin
router.get(
  '/:id',
  authMiddleware,
  entregaIdValidator,
  canViewEntrega,
  getEntregaById
);

export default router;