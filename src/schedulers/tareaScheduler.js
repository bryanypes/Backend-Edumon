import cron from 'node-cron';
import Tarea from '../models/Tarea.js';
import { notificarTareaProximaVencer } from '../services/notificacionService.js';

/**
 * Busca tareas publicadas que vencen entre 23h y 24h desde ahora y dispara el
 * recordatorio. Ventana de 1 hora (coincide con la frecuencia del cron) en vez
 * de "próximas 24h": con una ventana de 24h cada tarea caería en el rango de
 * las 24 ejecuciones horarias siguientes y se reenviaría el recordatorio cada
 * hora hasta el vencimiento.
 *
 * Exportada por separado del registro del cron para poder invocarla
 * directamente desde los tests, sin depender de temporizadores reales.
 */
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

/**
 * Ejecutar cada hora para verificar tareas próximas a vencer
 */
export const iniciarSchedulerTareas = () => {
  cron.schedule('0 * * * *', verificarTareasProximasAVencer);
  console.log(' Scheduler de tareas iniciado');
};
