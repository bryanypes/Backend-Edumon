import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  crearPerfil,
  getMisPerfiles,
  seleccionarPerfil,
  actualizarPerfil,
  eliminarPerfil,
  guardarFCMTokenPerfil
} from '../controllers/perfilFamiliarController.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getMisPerfiles);                    // Ver todos mis perfiles
router.post('/', crearPerfil);                      // Crear perfil
router.post('/seleccionar', seleccionarPerfil);     // Elegir perfil activo → nuevo token
router.put('/:id', actualizarPerfil);               // Editar perfil
router.delete('/:id', eliminarPerfil);              // Eliminar perfil
router.post('/fcm-token', guardarFCMTokenPerfil);   // Guardar token por perfil

export default router;