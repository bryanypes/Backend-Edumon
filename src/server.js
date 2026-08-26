import mongoose from 'mongoose';
import crearApp from './app.js';
import connectDB from './config/database.js';
import { iniciarSchedulerTareas } from './schedulers/tareaScheduler.js';
import { registrarObservers } from './events/NotificacionObservers.js';

const { app, server } = crearApp();
const isDev = process.env.NODE_ENV === 'development';

registrarObservers();

// Base de datos + scheduler
connectDB();
iniciarSchedulerTareas();

// Start
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('WebSocket habilitado');
  if (isDev) console.log('CORS: abierto para desarrollo');
});

// En un contenedor, cada redeploy/escalado manda SIGTERM al proceso — sin
// esto, Node lo mata de inmediato y corta a la mitad cualquier petición en
// curso. Se deja de aceptar conexiones nuevas, se espera a que terminen las
// que ya estaban abiertas y solo entonces se cierra Mongo.
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
