import cron from 'node-cron';
import Tarea from '../models/Tarea.js';
import { notificarTareaProximaVencer } from '../services/notificacionService.js';

// ventana de 23h-24h (no "próximas 24h"): con 24h completas cada tarea caería
// en las 24 corridas horarias siguientes y el recordatorio se reenviaría cada hora.
// exportada aparte del cron para poder invocarla directo desde los tests.
export const verificarTareasProximasAVencer = async () => {
  try {
    console.log(' Verificando tareas próximas a vencer...');

    const ahora = new Date();
    const en23Horas = new Date(ahora.getTime() + 23 * 60 * 60 * 1000);
    const en24Horas = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

    const tareas = await Tarea.find({
      estado: 'publicada',
      fechaEntrega: {
        $gte: en23Horas,
        $lte: en24Horas
      }
    }).lean();

    console.log(` ${tareas.length} tareas próximas a vencer encontradas`);

    // notificarTareaProximaVencer ya atrapa sus propios errores internamente
    await Promise.all(tareas.map(tarea => notificarTareaProximaVencer(tarea)));

    console.log(' Notificaciones de recordatorio enviadas');
    return tareas;
  } catch (error) {
    console.error('Error en scheduler de tareas:', error);
    return [];
  }
};

export const iniciarSchedulerTareas = () => {
  cron.schedule('0 * * * *', verificarTareasProximasAVencer);
  console.log(' Scheduler de tareas iniciado');
};
