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

import { authMiddleware } from '../middlewares/authMiddleware.js';
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

// IMPORTAR EL MIDDLEWARE DE MULTER PARA ARCHIVOS
import { uploadArchivoCloudinary } from '../middlewares/cloudinaryMiddleware.js';

const router = express.Router();

// Rutas para docentes

/**
 * GET /entregas
 * Listar todas las entregas (con filtros)
 * Query params: ?page=1&limit=10&estado=enviada
 */
router.get(
  '/', 
  authMiddleware,
  filterEntregasForUser,
  getAllEntregas
);

/**
 * GET /entregas/tarea/:tareaId
 * Listar todas las entregas de una tarea específica
 * Query params: ?page=1&limit=20&estado=enviada
 */
router.get(
  '/tarea/:tareaId',
  authMiddleware,
  getEntregasByTarea
);

/**
 * GET /entregas/padre/:padreId
 * Listar todas las entregas de un padre específico
 * Query params: ?page=1&limit=10&estado=enviada
 */
router.get(
  '/padre/:padreId',
  authMiddleware,
  getEntregasByPadre
);

/**
 * PATCH /entregas/:id/calificar
 * Calificar una entrega
 * Body: { nota, comentario, docenteId }
 */
router.patch(
  '/:id/calificar', 
  authMiddleware, 
  calificarEntregaValidator,
  canCalificarEntrega,
  calificarEntrega
);

// Rutas para padres

/**
 * POST /entregas
 * Crear una nueva entrega
 * Body: { tareaId, padreId, archivos?, textoRespuesta?, estado? }
 * 
 * 
 */
router.post(
  '/', 
  authMiddleware,
  uploadArchivoCloudinary.array('archivos', 5), // ← ESTO VA PRIMERO
  createEntregaValidator,
  canCreateEntrega,
  createEntrega
);

/**
 * GET /entregas/mis-entregas/:tareaId
 * Listar entregas del padre autenticado para una tarea específica
 */
router.get(
  '/mis-entregas/:tareaId',
  authMiddleware,
  getEntregasByPadreAndTarea
);

/**
 * PUT /entregas/:id
 * Actualizar una entrega (solo en borrador)
 * Body: { archivos?, textoRespuesta?, estado? }
 */
router.put(
  '/:id', 
  authMiddleware,
  uploadArchivoCloudinary.array('archivos', 5), // ← Y AQUÍ TAMBIÉN
  updateEntregaValidator,
  canModifyEntrega,
  updateEntrega
);

/**
 * PATCH /entregas/:id/enviar
 * Enviar una entrega (cambiar de borrador a enviada/tarde)
 */
router.patch(
  '/:id/enviar',
  authMiddleware,
  canModifyEntrega,
  enviarEntrega
);

/**
 * DELETE /entregas/:id
 * Eliminar una entrega (solo en borrador)
 */
router.delete(
  '/:id', 
  authMiddleware, 
  entregaIdValidator,
  canModifyEntrega,
  deleteEntrega
);

/**
 * DELETE /entregas/:id/archivos/:archivoId
 * Eliminar un archivo específico de una entrega
 */
router.delete(
  '/:id/archivos/:archivoId',
  authMiddleware,
  canModifyEntrega,
  eliminarArchivoEntrega
);

// Rutas compartidas

/**
 * GET /entregas/:id
 * Ver detalles de una entrega específica
 * Accesible por: padre dueño, docente de la tarea, admin
 */
router.get(
  '/:id', 
  authMiddleware, 
  entregaIdValidator,
  canViewEntrega,
  getEntregaById
);

export default router;