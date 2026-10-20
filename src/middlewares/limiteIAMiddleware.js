import rateLimit from 'express-rate-limit';

// Límite por USUARIO (no por IP: en el wifi del colegio muchas familias comparten
// IP) para los endpoints de /api/ia que llaman a un proveedor de IA. Al pasarse
// se responde 429 con un mensaje claro: nunca se cae a las reglas en silencio.
//   IA_RATE_LIMIT_MAX            solicitudes por ventana (por defecto 20)
//   IA_RATE_LIMIT_WINDOW_SECONDS tamaño de la ventana (por defecto 60)
const ventanaSegundos = () => (Number(process.env.IA_RATE_LIMIT_WINDOW_SECONDS) > 0
  ? Number(process.env.IA_RATE_LIMIT_WINDOW_SECONDS) : 60);
const maximo = () => (Number(process.env.IA_RATE_LIMIT_MAX) > 0 ? Number(process.env.IA_RATE_LIMIT_MAX) : 20);

export const crearLimiteIA = () => rateLimit({
  windowMs: ventanaSegundos() * 1000,
  limit: () => maximo(),
  standardHeaders: true,
  legacyHeaders: false,
  // va después de authMiddleware: siempre hay usuario
  keyGenerator: (req) => `ia:${req.user.userId}`,
  handler: (req, res) => {
    const retryAfter = Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000));
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      message: `Llegaste al límite de ${maximo()} solicitudes a Edumon cada ${ventanaSegundos()} segundos. Espera ${retryAfter} s y vuelve a intentarlo.`,
      code: 'LIMITE_IA',
      retryAfter,
    });
  },
});
