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

// CREAR CURSO (con foto de portada + CSV opcional)
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

// LISTAR TODOS LOS CURSOS
router.get('/', 
  authMiddleware, 
  requireRole(['administrador', 'docente', 'padre']), 
  getCursos
);

// OBTENER MIS CURSOS
router.get('/mis-cursos', 
  authMiddleware, 
  getMisCursos
);

// Obtener participantes de un curso
router.get('/:id/participantes', 
  authMiddleware, 
  requireRole(['administrador', 'docente']),
  cursoIdValidator,
  getParticipantesCurso
);

// OBTENER CURSO POR ID
router.get('/:id', 
  authMiddleware, 
  cursoIdValidator, 
  getCursoById
);

// ACTUALIZAR CURSO (solo imagen, sin CSV)
router.put('/:id', 
  authMiddleware, 
  requireRole(['administrador', 'docente']),
  uploadImagenCloudinary.single('fotoPortada'), // Solo imagen aquí
  updateCursoValidator, 
  updateCurso
);

// ARCHIVAR CURSO (soft delete)
router.delete('/:id', 
  authMiddleware, 
  requireRole(['administrador', 'docente']), 
  cursoIdValidator, 
  archivarCurso
);

// RESTAURAR CURSO (revierte el archivado)
router.patch('/:id/restaurar',
  authMiddleware,
  requireRole(['administrador', 'docente']),
  cursoIdValidator,
  restaurarCurso
);

// AGREGAR PARTICIPANTE INDIVIDUAL
router.post('/:id/participantes', 
  authMiddleware, 
  requireRole(['administrador', 'docente', 'padre']), 
  participanteValidator, 
  agregarParticipante
);

// REMOVER PARTICIPANTE
router.delete('/:id/participantes/:usuarioId', 
  authMiddleware, 
  requireRole(['administrador', 'docente']), 
  removerParticipante
);

// CARGA MASIVA DE USUARIOS (solo CSV)
router.post('/:id/usuarios-masivo', 
  authMiddleware, 
  requireRole(['administrador', 'docente']), 
  cursoIdValidator,
  uploadCSVCloudinary.single('archivoCSV'), // Solo CSV aquí
  registrarUsuariosMasivo
);

export default router;