import express from 'express';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import {
  crearInstitucion,
  getInstituciones,
  getMiInstitucion,
  preregistrarDocente,
  updateInstitucion
} from '../controllers/institucionController.js';
// Agrega el import del middleware de CSV
import { uploadCSVCloudinary } from '../middlewares/cloudinaryMiddleware.js';
import { preregistrarDocentesCSV } from '../controllers/institucionController.js';

const router = express.Router();

router.use(authMiddleware);

// Solo superadmin
router.post('/', requireRole(['superadmin']), crearInstitucion);
router.get('/', requireRole(['superadmin']), getInstituciones);
router.put('/:id', requireRole(['superadmin']), updateInstitucion);

// Admin del colegio
router.get('/mi-institucion', requireRole(['administrador', 'superadmin']), getMiInstitucion);
router.post('/docentes', requireRole(['administrador']), preregistrarDocente);

// Admin del colegio: preregistrar docentes vía CSV
router.post(
  '/docentes/csv',
  requireRole(['administrador']),
  uploadCSVCloudinary.single('archivoCSV'),
  preregistrarDocentesCSV
);

export default router;