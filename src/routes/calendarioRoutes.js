import express from 'express';
import {
  obtenerCalendarioCurso,
  obtenerEventosDia,
  obtenerProximosEventos,
  obtenerCalendarioDocente,        // nuevo
  obtenerProximosEventosDocente    // nuevo
} from '../controllers/calendarioController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// ─── Rutas del docente (sin cursoId) ──────────────────
router.get('/docente/todos', obtenerCalendarioDocente);
router.get('/docente/proximos', obtenerProximosEventosDocente);

// ─── Rutas por curso (existentes) ────────────────────
router.get('/:cursoId', obtenerCalendarioCurso);
router.get('/:cursoId/dia', obtenerEventosDia);
router.get('/:cursoId/proximos', obtenerProximosEventos);

export default router;