import express from 'express';
import {
  createCurso,
  getCursos,
  getCursoById,
  getMisCursos,
  updateCurso,
  archivarCurso,
  restaurarCurso,
  agregarParticipante,
  removerParticipante,
  registrarUsuariosMasivo,
  getParticipantesCurso
} from '../controllers/cursoController.js';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import {
  createCursoValidator,
  updateCursoValidator,
  participanteValidator,
  cursoIdValidator
} from '../middlewares/validators/cursoValidator.js';
import { 
  uploadImagenCloudinary, 
  uploadImagenYCSV,        
  uploadCSVCloudinary 
} from '../middlewares/cloudinaryMiddleware.js';

const router = express.Router();

// admite foto de portada + CSV opcional
router.post('/',
  authMiddleware, 
  requireRole(['administrador', 'docente']),
  uploadImagenYCSV.fields([           
    { name: 'fotoPortada', maxCount: 1 },
    { name: 'archivoCSV', maxCount: 1 }
  ]),
  createCursoValidator, 
  createCurso
);

router.get('/',
  authMiddleware, 
  requireRole(['administrador', 'docente', 'padre']), 
  getCursos
);

router.get('/mis-cursos',
  authMiddleware, 
  getMisCursos
);

router.get('/:id/participantes',
  authMiddleware, 
  requireRole(['administrador', 'docente']),
  cursoIdValidator,
  getParticipantesCurso
);

router.get('/:id',
  authMiddleware, 
  cursoIdValidator, 
  getCursoById
);

// solo imagen aquí, sin CSV
router.put('/:id',
  authMiddleware, 
  requireRole(['administrador', 'docente']),
  uploadImagenCloudinary.single('fotoPortada'), // Solo imagen aquí
  updateCursoValidator, 
  updateCurso
);

// soft delete
router.delete('/:id',
  authMiddleware, 
  requireRole(['administrador', 'docente']), 
  cursoIdValidator, 
  archivarCurso
);

router.patch('/:id/restaurar',
  authMiddleware,
  requireRole(['administrador', 'docente']),
  cursoIdValidator,
  restaurarCurso
);

router.post('/:id/participantes',
  authMiddleware, 
  requireRole(['administrador', 'docente', 'padre']), 
  participanteValidator, 
  agregarParticipante
);

router.delete('/:id/participantes/:usuarioId',
  authMiddleware, 
  requireRole(['administrador', 'docente']), 
  removerParticipante
);

router.post('/:id/usuarios-masivo',
  authMiddleware, 
  requireRole(['administrador', 'docente']), 
  cursoIdValidator,
  uploadCSVCloudinary.single('archivoCSV'), // Solo CSV aquí
  registrarUsuariosMasivo
);

export default router;