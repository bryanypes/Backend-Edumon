import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

/**
 * Construye la app Express + servidor HTTP + Socket.IO, sin efectos secundarios
 * (no conecta a Mongo, no arranca el scheduler, no llama a .listen()).
 * server.js es el único responsable de esas tres cosas en producción/desarrollo;
 * los tests importan este archivo directamente y controlan ellos mismos la BD
 * (mongodb-memory-server) y el ciclo de vida del servidor HTTP.
 */
export const crearApp = () => {
  const app    = express();
  const server = http.createServer(app);
  const isDev  = process.env.NODE_ENV === 'development';

  app.set('trust proxy', 1);

  // Middlewares tempranos
  // 30s se quedaba corto para las rutas que suben archivos a Cloudinary
  // (tareas, entregas, fotos de curso/perfil, CSV de docentes/padres/
  // instituciones — ver grep de "upload." en routes/): en Render, sin
  // arranque en caliente, un solo archivo de varios MB o una imagen externa
  // que Cloudinary tiene que descargar (ver "enlaces" en tareas) pueden
  // tardar más de 30s. La petición SÍ terminaba de procesarse en el
  // servidor, pero el cliente ya había recibido un 503 "Response timeout" y
  // el usuario veía el guardado como fallido — de ahí que hubiera que
  // reintentar varias veces (con el riesgo real de crear duplicados, porque
  // el intento anterior seguía corriendo en segundo plano).
  app.use(timeout('90s'));
  app.use(compression());

  // Orígenes permitidos
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

  // Seguridad (Helmet)
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

  // Sanitización NoSQL
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

  // Rate limit global
  const makeRateLimitHandler = (mensaje) =>
    rateLimit({
      windowMs:         15 * 60 * 1000,
      max:              100,
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

  // Rate limit estricto para endpoints de autenticación
  const limiterAuth = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             10,
    standardHeaders: true,
    legacyHeaders:   false,
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
