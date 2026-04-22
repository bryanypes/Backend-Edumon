import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/database.js';
import { setupSocketIO } from './socket/socketHandlers.js';
import { iniciarSchedulerTareas } from './schedulers/tareaScheduler.js';
import { registrarObservers } from './events/notificacionObservers.js';

// Rutas
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

// ─── Config ─────────────────────────────
dotenv.config();

const app = express();
const server = http.createServer(app);

// ─── Orígenes permitidos ─────────────────
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

// ─── Seguridad ───────────────────────────
app.use(
  helmet({
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: [
          "'self'",
          'http://localhost:3000',
          process.env.FRONTEND_URL
        ].filter(Boolean),
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    }
  })
);

// Permissions Policy
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  next();
});

// Cache control
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Sanitización
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(key => {
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
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].replace(/\$|\{|\}/g, '_');
      }
    });
  }

  next();
});

// ─── Rate limit ──────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Demasiadas solicitudes, intenta más tarde' }
}));

const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Demasiados intentos de autenticación' }
});

app.use('/api/auth/login', limiterAuth);
app.use('/api/auth/register', limiterAuth);

// ─── CORS (lo dejé tal cual lo tenías) ───
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? '*'
    : allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── Body parsers ────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Socket.IO ──────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

global.io = io;
setupSocketIO(io);
registrarObservers();

// ─── DB + Scheduler ─────────────────────
connectDB();
iniciarSchedulerTareas();

// ─── Rutas ─────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cursos', cursoRoutes);
app.use('/api/modulos', moduloRoutes);
app.use('/api/tareas', tareaRoutes);
app.use('/api/entregas', entregaRoutes);
app.use('/api/notificaciones', notificacionRoutes);
app.use('/api/eventos', eventoRoutes);
app.use('/api/calendario', calendarioRoutes);
app.use('/api/foros', foroRoutes);
app.use('/api/mensajes-foro', mensajeForoRoutes);
app.use('/api/instituciones', institucionRoutes);
app.use('/api/perfiles', perfilFamiliarRoutes);

// ─── Health check ───────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'API funcionando correctamente',
    websocket: 'Socket.IO habilitado',
    entorno: process.env.NODE_ENV || 'development'
  });
});

// ─── 404 handler (BIEN UBICADO) ─────────
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// ─── Error handler ──────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// ─── Start ─────────────────────────────
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`WebSocket habilitado`);
});

export default app;