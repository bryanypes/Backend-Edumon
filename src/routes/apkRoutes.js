import express from 'express';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import { uploadApk } from '../middlewares/cloudinaryMiddleware.js';
import {
  getApkActual,
  listarApks,
  subirApk,
  actualizarApk,
  eliminarApk
} from '../controllers/apkController.js';

const router = express.Router();

// Público: la web y la app lo usan para ofrecer/descargar la última versión
router.get('/actual', getApkActual);

// Gestión: solo superadmin
router.get('/', authMiddleware, requireRole(['superadmin']), listarApks);
router.post('/', authMiddleware, requireRole(['superadmin']), uploadApk.single('apk'), subirApk);
router.put('/:id', authMiddleware, requireRole(['superadmin']), actualizarApk);
router.delete('/:id', authMiddleware, requireRole(['superadmin']), eliminarApk);

// errores de multer (tamaño / tipo)
router.use((error, req, res, next) => {
  if (error) {
    return res.status(400).json({ message: error.message || 'Error al subir el archivo' });
  }
  next();
});

export default router;
