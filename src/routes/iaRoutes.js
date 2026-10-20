import express from 'express';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware.js';
import { requireConsentimientoIA } from '../middlewares/consentimientoIAMiddleware.js';
import { crearLimiteIA } from '../middlewares/limiteIAMiddleware.js';
import {
  getConsentimiento,
  aceptarConsentimiento,
  revocarConsentimiento,
  getMisConversaciones,
  crearConversacion,
  getConversacion,
  eliminarConversacion,
  enviarMensaje,
  pedirAyuda,
  getAlertas,
  getAlerta,
  actualizarAlerta,
  getTemas,
  generarRetoBorrador,
  sugerirModulosCurso,
  getSaludIA,
  verificarIntegridadAlerta,
  verificarIntegridadAlertas,
} from '../controllers/iaController.js';
import {
  getLineamientos,
  generarBorradorLineamientos,
  guardarBorradorLineamientos,
  publicarLineamientos,
  getSeguimientoLineamientos,
  getDetalleParticipacion,
} from '../controllers/lineamientosController.js';
import { uploadPdfComunicado } from '../middlewares/cloudinaryMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// límite por usuario en los endpoints que llaman a un proveedor de IA
const limiteIA = crearLimiteIA();

// ─── Plataforma: estado de los proveedores de IA ──────────────────────────────
router.get('/health', requireRole(['administrador']), getSaludIA);

// ─── Familia: acompañante Edumon ──────────────────────────────────────────────
const soloFamilia = requireRole(['padre']);
const familiaConConsentimiento = [soloFamilia, requireConsentimientoIA];

router.get('/consentimiento', soloFamilia, getConsentimiento);
router.post('/consentimiento', soloFamilia, aceptarConsentimiento);
router.delete('/consentimiento', soloFamilia, revocarConsentimiento);

router.get('/conversaciones', familiaConConsentimiento, getMisConversaciones);
router.post('/conversaciones', familiaConConsentimiento, crearConversacion);
router.get('/conversaciones/:id', familiaConConsentimiento, getConversacion);
router.delete('/conversaciones/:id', familiaConConsentimiento, eliminarConversacion);
router.post('/conversaciones/:id/mensajes', familiaConConsentimiento, limiteIA, enviarMensaje);
router.post('/conversaciones/:id/ayuda', familiaConConsentimiento, pedirAyuda);

// ─── Colegio: alertas de riesgo ───────────────────────────────────────────────
// el controlador además exige que el docente sea el responsable de convivencia
const colegio = requireRole(['docente', 'administrador']);

router.get('/alertas', colegio, getAlertas);
// antes de /alertas/:id para que "integridad" no se lea como un id
router.get('/alertas/integridad', colegio, verificarIntegridadAlertas);
router.get('/alertas/:id/integridad', colegio, verificarIntegridadAlerta);
router.get('/alertas/:id', colegio, getAlerta);
router.patch('/alertas/:id', colegio, actualizarAlerta);

// ─── Colegio: retos de escuela de padres ──────────────────────────────────────
router.get('/temas', colegio, getTemas);
router.post('/retos/borrador', colegio, limiteIA, generarRetoBorrador);
router.post('/modulos/sugerencias', colegio, limiteIA, sugerirModulosCurso);

// ─── Colegio: lineamientos de escuela de padres (rectoría → docentes) ─────────
const soloAdmin = requireRole(['administrador']);

router.get('/lineamientos', colegio, getLineamientos);
router.get('/lineamientos/seguimiento', colegio, getSeguimientoLineamientos);
router.get('/lineamientos/seguimiento/:cursoId', colegio, getDetalleParticipacion);
router.post('/lineamientos/borrador', soloAdmin, limiteIA, uploadPdfComunicado.single('archivo'), generarBorradorLineamientos);
router.put('/lineamientos', soloAdmin, guardarBorradorLineamientos);
router.post('/lineamientos/publicar', soloAdmin, publicarLineamientos);

export default router;
