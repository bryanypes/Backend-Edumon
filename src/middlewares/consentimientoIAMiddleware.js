import ConsentimientoIA from '../models/ConsentimientoIA.js';
import { VERSION_CONSENTIMIENTO } from '../config/edumonIA.js';

// Bloquea el uso de Edumon (IA) si el perfil activo no ha aceptado la versión
// vigente del consentimiento. Va después de authMiddleware.
export const requireConsentimientoIA = async (req, res, next) => {
  try {
    const vigente = await ConsentimientoIA.obtenerVigente(
      req.user.userId,
      req.user.perfilId,
      VERSION_CONSENTIMIENTO,
    ).lean();

    if (!vigente) {
      return res.status(403).json({
        message: 'Debes aceptar el consentimiento informado para usar Edumon',
        code: 'CONSENTIMIENTO_REQUERIDO',
        version: VERSION_CONSENTIMIENTO,
      });
    }

    next();
  } catch (error) {
    console.error('[requireConsentimientoIA]', error);
    res.status(500).json({ message: 'Error interno' });
  }
};
