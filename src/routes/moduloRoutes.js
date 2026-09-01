import express from 'express';
import { 
  createModulo, 
  getModulos, 
  getModuloById,
  getModulosByCurso,
  updateModulo, 
  deleteModulo,
  restoreModulo
} from '../controllers/moduloController.js';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import { 
  createModuloValidator, 
  updateModuloValidator,
  moduloIdValidator,
  cursoIdValidator
} from '../middlewares/validators/moduloValidator.js';

const router = express.Router();

// crear/editar/eliminar/restaurar: solo administrador o docente
router.post('/', authMiddleware, requireRole(['administrador', 'docente']), createModuloValidator, createModulo);
router.get('/curso/:cursoId', authMiddleware, cursoIdValidator, getModulosByCurso);
router.get('/', authMiddleware, getModulos);
router.get('/:id', authMiddleware, moduloIdValidator, getModuloById);
router.put('/:id', authMiddleware, requireRole(['administrador', 'docente']), updateModuloValidator, updateModulo);
router.delete('/:id', authMiddleware, requireRole(['administrador', 'docente']), moduloIdValidator, deleteModulo);
router.patch('/:id/restore', authMiddleware, requireRole(['administrador', 'docente']), moduloIdValidator, restoreModulo);

export default router;