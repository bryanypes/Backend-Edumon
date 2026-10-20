import express from 'express';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import {
  crearInstitucion,
  getInstituciones,
  getMiInstitucion,
  preregistrarDocente,
  updateInstitucion,
  cambiarEstadoInstitucion,
  deleteInstitucion,
  asignarResponsableConvivencia
} from '../controllers/institucionController.js';
import { param } from 'express-validator';
import { uploadCSVCloudinary } from '../middlewares/cloudinaryMiddleware.js';
import { preregistrarDocentesCSV } from '../controllers/institucionController.js';
import { crearInstitucionValidator } from '../middlewares/validators/institucionValidator.js';

const router = express.Router();

router.use(authMiddleware);

// Solo superadmin
router.post('/', requireRole(['superadmin']), crearInstitucionValidator, crearInstitucion);
router.get('/', requireRole(['superadmin']), getInstituciones);
router.put('/:id', requireRole(['superadmin']), updateInstitucion);
router.patch('/:id/estado', requireRole(['superadmin']), cambiarEstadoInstitucion);
// irreversible: borra la institución y TODO lo que depende de ella (cursos,
// tareas, entregas, eventos, foros, docentes/admins, y los padres que se
// queden sin ningún otro curso). Ver el comentario en el controlador.
router.delete(
  '/:id',
  requireRole(['superadmin']),
  [param('id').isMongoId().withMessage('ID de institución inválido')],
  deleteInstitucion,
);

// Admin del colegio
router.get('/mi-institucion', requireRole(['administrador', 'superadmin']), getMiInstitucion);
router.post('/docentes', requireRole(['administrador']), preregistrarDocente);
router.patch('/responsable-convivencia', requireRole(['administrador']), asignarResponsableConvivencia);

router.post(
  '/docentes/csv',
  requireRole(['administrador']),
  uploadCSVCloudinary.single('archivoCSV'),
  preregistrarDocentesCSV
);

export default router;