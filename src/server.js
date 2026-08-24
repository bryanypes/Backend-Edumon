import crearApp from './app.js';
import connectDB from './config/database.js';
import { iniciarSchedulerTareas } from './schedulers/tareaScheduler.js';
import { registrarObservers } from './events/NotificacionObservers.js';

const { app, server } = crearApp();
const isDev = process.env.NODE_ENV === 'development';

registrarObservers();

// ─── Base de datos + scheduler ────────────────────────────────────────────────
connectDB();
iniciarSchedulerTareas();

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('WebSocket habilitado');
  if (isDev) console.log('CORS: abierto para desarrollo');
});

export default app;
