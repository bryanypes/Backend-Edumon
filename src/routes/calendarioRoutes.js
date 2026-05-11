import express from 'express';
import {
  obtenerCalendarioCurso,
  obtenerEventosDia,
  obtenerProximosEventos,
  obtenerCalendarioUsuario,        // nuevo
  obtenerProximosEventosUsuario    // nuevo
} from '../controllers/calendarioController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// calendarioRoutes.js — reemplaza las rutas de docente
router.get('/calendario', authMiddleware, obtenerCalendarioUsuario);
router.get('/calendario/proximos', authMiddleware, obtenerProximosEventosUsuario);

// ─── Rutas por curso (existentes) ────────────────────
router.get('/:cursoId', obtenerCalendarioCurso);
router.get('/:cursoId/dia', obtenerEventosDia);
router.get('/:cursoId/proximos', obtenerProximosEventos);

export default router;