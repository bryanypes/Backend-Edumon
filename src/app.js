import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import timeout from 'connect-timeout';
import compression from 'compression';

import { setupSocketIO } from './socket/socketHandlers.js';

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

  // 30s es corto para uploads grandes a Cloudinary en Render (cold start)
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
          imgSrc:         ["'self'", 'data:', 'res.cloudinary.com'],
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

  // Limita por teléfono en vez de IP: en wifi compartida de colegio, un
  // límite por IP bloqueaba a todos los padres por los intentos de uno solo
  const limiterAuth = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             10,
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator: (req) => (req.body?.telefono ? `tel:${req.body.telefono}` : ipKeyGenerator(req.ip)),
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

  app.use('/api/auth/login',    limiterAuth);
  app.use('/api/auth/register', limiterAuth);

  // recuperación de contraseña: el código es de 6 dígitos, sin este límite se
  // podía probar por fuerza bruta dentro de la ventana de validez
  app.use('/api/auth/forgot-password',       limiterAuth);
  app.use('/api/auth/forgot-password-phone', limiterAuth);
  app.use('/api/auth/reset-password',        limiterAuth);
  app.use('/api/auth/reset-password-phone',  limiterAuth);

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

  // Body parsers + Cookie parser
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
    console.error(err.stack);
    res.status(err.status || 500).json({
      message: err.message || 'Error interno del servidor',
      ...(isDev && { stack: err.stack }),
    });
  });

  return { app, server, io };
};

export default crearApp;
