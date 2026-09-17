import express from 'express';
import http from 'http';
import path from 'node:path';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import timeout from 'connect-timeout';
import compression from 'compression';
import multer from 'multer';

import { setupSocketIO } from './socket/socketHandlers.js';
import { authMiddleware } from './middlewares/authMiddleware.js';
import { verificarAccesoArchivoPrivado } from './middlewares/archivoPrivadoMiddleware.js';
import { normalizarTelefono } from './utils/normalizarTelefono.js';
import {
  UPLOAD_DIR,
  PUBLIC_PREFIX,
  CARPETA_PUBLICA,
  CARPETA_PRIVADA,
  AVATARES_DIR,
  AVATARES_PREFIX,
} from './config/almacenamiento.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cursoRoutes from './routes/cursoRoutes.js';
import moduloRoutes from './routes/moduloRoutes.js';
import tareaRoutes from './routes/tareaRoutes.js';
import entregaRoutes from './routes/entregaRoutes.js';
import notificacionRoutes from './routes/notificacionRoutes.js';
import eventoRoutes from './routes/eventoRoutes.js';
import calendarioRoutes from './routes/calendarioRoutes.js';
import foroRoutes from './routes/foroRoutes.js';
import mensajeForoRoutes from './routes/mensajeForoRoutes.js';
import institucionRoutes from './routes/institucionRoutes.js';
import perfilFamiliarRoutes from './routes/perfilFamiliarRoutes.js';
import buzonRoutes from './routes/buzonRoutes.js';
import apkRoutes from './routes/apkRoutes.js';

// Solo construye app + server + io. server.js conecta Mongo y arranca el
// scheduler; los tests importan este archivo directo con su propia BD en memoria.
export const crearApp = () => {
  const app    = express();
  const server = http.createServer(app);
  const isDev  = process.env.NODE_ENV === 'development';

  app.set('trust proxy', 1);

  // margen amplio: la publicación del APK (hasta 200 MB) se procesa en memoria
  app.use(timeout('90s'));
  app.use(compression());

  const frontendUrls = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    ...frontendUrls,
  ].filter(Boolean);

  app.use(
    helmet({
      hsts: {
        maxAge:            31536000,
        includeSubDomains: true,
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc:     ["'self'"],
          scriptSrc:      ["'self'"],
          styleSrc:       ["'self'", "'unsafe-inline'"],
          imgSrc:         ["'self'", 'data:', 'blob:'],
          connectSrc:     ["'self'", ...allowedOrigins],
          frameAncestors: ["'none'"],
          formAction:     ["'self'"],
          objectSrc:      ["'none'"],
          baseUri:        ["'self'"],
          upgradeInsecureRequests: isDev ? null : [],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Body parsers + Cookie parser: deben ir antes del sanitizador y de los
  // rate limiters de abajo (limiterAuth lee req.body.telefono) -- si no,
  // req.body llega undefined a ambos y el límite de login cae siempre al
  // fallback por IP, compartiendo el contador entre todos los padres detrás
  // de la misma IP/proxy en vez de limitar por número de teléfono.
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach((key) => {
        if (key.startsWith('$') || key.includes('.')) {
          delete obj[key];
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      });
    };

    sanitize(req.body);
    sanitize(req.params);

    if (req.query) {
      Object.keys(req.query).forEach((key) => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = req.query[key].replace(/\$|\{|\}/g, '_');
        }
      });
    }

    next();
  });

  // 500/15min por IP: con wifi institucional muchas familias comparten IP,
  // un límite más bajo tumbaba a todo el colegio por el tráfico de unos pocos
  const makeRateLimitHandler = (mensaje) =>
    rateLimit({
      windowMs:         15 * 60 * 1000,
      max:              500,
      standardHeaders:  true,
      legacyHeaders:    false,
      skipFailedRequests: false,
      handler: (req, res) => {
        const retryAfter = Math.ceil(
          (req.rateLimit.resetTime - Date.now()) / 1000,
        );
        res.set('Retry-After', retryAfter);
        res.status(429).json({
          message:    mensaje,
          retryAfter,
        });
      },
    });

  app.use('/api/', makeRateLimitHandler('Demasiadas solicitudes, intenta más tarde'));

  // Limita por teléfono/correo en vez de IP: en wifi compartida de colegio, un
  // límite por IP bloqueaba a todos los padres por los intentos de uno solo.
  // El fallback por IP usa ipKeyGenerator(req.ip, false) -- sin eso, el /56
  // por defecto agrupa a todos los celulares de un mismo operador móvil en
  // una sola IPv6 "subred", bloqueando a padres que ni se conocen entre sí.
  // normaliza el valor ANTES de armar la clave: el limiter corre antes que
  // los validators de la ruta (que son los que normalmente sanean telefono/
  // correo), así que sin esto "3001112233" y "+573001112233", o un correo en
  // mayúsculas, cuentan como cuentas distintas y duplican/multiplican el
  // cupo real de intentos permitidos
  const makeAuthLimiter = (campo, normalizar) =>
    rateLimit({
      windowMs:        15 * 60 * 1000,
      max:             10,
      standardHeaders: true,
      legacyHeaders:   false,
      keyGenerator: (req) => {
        const crudo = req.body?.[campo];
        const valor = typeof crudo === 'string' ? normalizar(crudo) : null;
        return valor ? `${campo}:${valor}` : ipKeyGenerator(req.ip, false);
      },
      handler: (req, res) => {
        const retryAfter = Math.ceil(
          (req.rateLimit.resetTime - Date.now()) / 1000,
        );
        res.set('Retry-After', retryAfter);
        res.status(429).json({
          message:    'Demasiados intentos de autenticación',
          retryAfter,
        });
      },
    });

  const limiterAuth = makeAuthLimiter('telefono', (v) => normalizarTelefono(v) ?? v);
  app.use('/api/auth/login',    limiterAuth);
  app.use('/api/auth/register', limiterAuth);

  // recuperación de contraseña: el código es de 6 dígitos, sin este límite se
  // podía probar por fuerza bruta dentro de la ventana de validez. Va por
  // 'correo' (no 'telefono', que estos dos endpoints no reciben) y con su
  // propio contador, separado del de login/registro.
  const limiterRecuperacion = makeAuthLimiter('correo', (v) => v.trim().toLowerCase());
  app.use('/api/auth/forgot-password',       limiterRecuperacion);
  app.use('/api/auth/reset-password',        limiterRecuperacion);

  // CORS
  const corsAbiertoTemporalmente = !isDev && frontendUrls.length === 0;
  if (corsAbiertoTemporalmente) {
    console.warn(
      'CORS abierto a cualquier origen: FRONTEND_URL no está configurado. ' +
      'Esto es temporal mientras no haya frontend desplegado — configúralo en cuanto lo despliegues.',
    );
  }

  app.use(
    cors({
      origin:           isDev || corsAbiertoTemporalmente ? true : allowedOrigins,
      credentials:      true,
      methods:          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders:   ['Content-Type', 'Authorization'],
    }),
  );

  // Archivos subidos (almacenamiento local en disco / volumen persistente)
  const setHeadersArchivo = (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (filePath.toLowerCase().endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment');
    }
  };
  // privados (adjuntos de entregas): sesión válida + dueño/docente/admin de la
  // institución (verificarAccesoArchivoPrivado) -- "private" en el Cache-Control
  // para que un proxy/caché compartido no le sirva el archivo a otro usuario
  // sin pasar de nuevo por ese chequeo.
  app.use(
    `${PUBLIC_PREFIX}/${CARPETA_PRIVADA}`,
    authMiddleware,
    verificarAccesoArchivoPrivado,
    express.static(path.join(UPLOAD_DIR, CARPETA_PRIVADA), {
      index: false,
      setHeaders: (res, filePath) => {
        setHeadersArchivo(res, filePath);
        res.setHeader('Cache-Control', 'private, max-age=86400');
      },
    }),
  );
  app.use(
    `${PUBLIC_PREFIX}/${CARPETA_PUBLICA}`,
    express.static(path.join(UPLOAD_DIR, CARPETA_PUBLICA), {
      index: false,
      setHeaders: setHeadersArchivo,
    }),
  );
  // avatares predeterminados (empaquetados con la imagen, no en el volumen)
  app.use(AVATARES_PREFIX, express.static(AVATARES_DIR, { index: false, maxAge: '7d' }));

  // Socket.IO
  const io = new Server(server, {
    cors: {
      origin:      isDev ? true : allowedOrigins,
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  global.io = io;
  setupSocketIO(io);

  // Rutas
  app.use('/api/auth',          authRoutes);
  app.use('/api/users',         userRoutes);
  app.use('/api/cursos',        cursoRoutes);
  app.use('/api/modulos',       moduloRoutes);
  app.use('/api/tareas',        tareaRoutes);
  app.use('/api/entregas',      entregaRoutes);
  app.use('/api/notificaciones',notificacionRoutes);
  app.use('/api/eventos',       eventoRoutes);
  app.use('/api/calendario',    calendarioRoutes);
  app.use('/api/foros',         foroRoutes);
  app.use('/api/mensajes-foro', mensajeForoRoutes);
  app.use('/api/instituciones', institucionRoutes);
  app.use('/api/perfiles',      perfilFamiliarRoutes);
  app.use('/api/buzon',         buzonRoutes);
  app.use('/api/apk',           apkRoutes);

  // Health check
  app.get('/', (req, res) => {
    res.json({
      message:   'API funcionando correctamente',
      websocket: 'Socket.IO habilitado',
      entorno:   process.env.NODE_ENV || 'development',
    });
  });

  // 404
  app.use((req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
  });

  // Error handler global
  app.use((err, req, res, next) => {
    // Fallback para rutas de subida de archivos que no capturan MulterError
    // por su cuenta (tareaRoutes y apkRoutes sí lo hacen): sin esto, un
    // adjunto muy grande (foto de celular en una entrega/foro/evento, por
    // ejemplo) termina en un 500 con el mensaje crudo de multer en inglés.
    if (err instanceof multer.MulterError) {
      const mensajes = {
        LIMIT_FILE_SIZE:  'El archivo es demasiado grande para subir. Intenta con uno más liviano.',
        LIMIT_FILE_COUNT: 'Adjuntaste demasiados archivos a la vez.',
        LIMIT_UNEXPECTED_FILE: 'No se pudo subir el archivo: el tipo o el campo no es el esperado.',
      };
      return res.status(400).json({
        message: mensajes[err.code] || 'No se pudo subir el archivo. Verifica el formato e inténtalo de nuevo.',
      });
    }

    console.error(err.stack);
    res.status(err.status || 500).json({
      message: err.message || 'Error interno del servidor',
      ...(isDev && { stack: err.stack }),
    });
  });

  return { app, server, io };
};

export default crearApp;
