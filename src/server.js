import mongoose from 'mongoose';
import crearApp from './app.js';
import connectDB from './config/database.js';
import { iniciarSchedulerTareas } from './schedulers/tareaScheduler.js';
import { registrarObservers } from './events/NotificacionObservers.js';
import { bootstrapAdmins } from './scripts/bootstrapAdmins.js';
import { registrarProveedoresAlArrancar } from './services/ia/proveedorIA.js';

const { app, server } = crearApp();
const isDev = process.env.NODE_ENV === 'development';

registrarObservers();

connectDB().then(() =>
  bootstrapAdmins().catch((error) =>
    console.error('[bootstrap] Error inesperado creando administradores iniciales:', error.message),
  ),
);
iniciarSchedulerTareas();

const PORT = process.env.PORT || 4000;
// 0.0.0.0: Render (y Docker) exigen escuchar en todas las interfaces, no solo en localhost
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('WebSocket habilitado');
  registrarProveedoresAlArrancar();
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
