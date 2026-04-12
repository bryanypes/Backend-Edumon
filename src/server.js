import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { setupSocketIO } from './socket/socketHandlers.js';

// Importar rutas
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

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL
];


// Configurar Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Hacer io global
global.io = io;

// Configurar Socket handlers
setupSocketIO(io);


// Middleware CORS (permite localhost + Vercel)
app.use(cors({
  origin: function (origin, callback) {
    // Permite requests sin origin (Postman, mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Conectar a MongoDB
connectDB();


// Rutas
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


// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'API funcionando correctamente',
    websocket: 'Socket.IO habilitado'
  });
});


// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});


const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`WebSocket habilitado`);
});

export default app;