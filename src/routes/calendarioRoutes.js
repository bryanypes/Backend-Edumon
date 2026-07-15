import express from 'express';
import {
  obtenerCalendarioCurso,
  obtenerEventosDia,
  obtenerProximosEventos,
  obtenerCalendarioUsuario,
  obtenerProximosEventosUsuario
} from '../controllers/calendarioController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/calendario', obtenerCalendarioUsuario);
router.get('/calendario/proximos', obtenerProximosEventosUsuario);

// ─── Rutas por curso (existentes) ────────────────────
router.get('/:cursoId', obtenerCalendarioCurso);
router.get('/:cursoId/dia', obtenerEventosDia);
router.get('/:cursoId/proximos', obtenerProximosEventos);

export default router;