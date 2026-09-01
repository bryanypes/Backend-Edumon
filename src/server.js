import mongoose from 'mongoose';
import crearApp from './app.js';
import connectDB from './config/database.js';
import { iniciarSchedulerTareas } from './schedulers/tareaScheduler.js';
import { registrarObservers } from './events/NotificacionObservers.js';

const { app, server } = crearApp();
const isDev = process.env.NODE_ENV === 'development';

registrarObservers();

connectDB();
iniciarSchedulerTareas();

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('WebSocket habilitado');
  if (isDev) console.log('CORS: abierto para desarrollo');
});

// sin esto, un redeploy manda SIGTERM y Node mata las peticiones en curso a la mitad
const apagarOrdenadamente = (señal) => {
  console.log(`${señal} recibida, cerrando el servidor...`);
  server.close(async () => {
    await mongoose.connection.close();
    process.exit(0);
  });
};

process.on('SIGTERM', () => apagarOrdenadamente('SIGTERM'));
process.on('SIGINT', () => apagarOrdenadamente('SIGINT'));

export default app;
