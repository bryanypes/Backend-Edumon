import { describe, it, expect, vi, beforeEach } from 'vitest';

const notificarTareaProximaVencerMock = vi.fn(async () => {});

vi.mock('../../../src/services/notificacionService.js', () => ({
  notificarTareaProximaVencer: (...args) => notificarTareaProximaVencerMock(...args),
}));

const { verificarTareasProximasAVencer } = await import('../../../src/schedulers/tareaScheduler.js');
const { crearTarea } = await import('../../helpers/factories.js');

const horasDesdeAhora = (h) => new Date(Date.now() + h * 60 * 60 * 1000);

describe('verificarTareasProximasAVencer', () => {
  beforeEach(() => {
    notificarTareaProximaVencerMock.mockClear();
  });

  it('encuentra tareas publicadas que vencen entre las 23h y las 24h desde ahora', async () => {
    const dentroDeVentana = await crearTarea({ estado: 'publicada', fechaEntrega: horasDesdeAhora(23.5) });
    await crearTarea({ estado: 'publicada', fechaEntrega: horasDesdeAhora(10) }); // muy pronto, fuera de ventana
    await crearTarea({ estado: 'publicada', fechaEntrega: horasDesdeAhora(48) }); // muy lejos, fuera de ventana

    const encontradas = await verificarTareasProximasAVencer();

    expect(encontradas.map((t) => t._id.toString())).toEqual([dentroDeVentana._id.toString()]);
    expect(notificarTareaProximaVencerMock).toHaveBeenCalledTimes(1);
  });

  it('ignora tareas cerradas aunque su fecha de entrega caiga en la ventana', async () => {
    await crearTarea({ estado: 'cerrada', fechaEntrega: horasDesdeAhora(23.5) });

    const encontradas = await verificarTareasProximasAVencer();

    expect(encontradas).toHaveLength(0);
    expect(notificarTareaProximaVencerMock).not.toHaveBeenCalled();
  });

  it('no lanza si notificarTareaProximaVencer falla para una tarea (no debe tumbar el cron)', async () => {
    await crearTarea({ estado: 'publicada', fechaEntrega: horasDesdeAhora(23.5) });
    notificarTareaProximaVencerMock.mockRejectedValueOnce(new Error('fallo de red'));

    await expect(verificarTareasProximasAVencer()).resolves.not.toThrow();
  });

  it('devuelve array vacío (sin lanzar) si la consulta a la base de datos falla', async () => {
    const Tarea = (await import('../../../src/models/Tarea.js')).default;
    const spy = vi.spyOn(Tarea, 'find').mockImplementationOnce(() => {
      throw new Error('conexión perdida');
    });

    await expect(verificarTareasProximasAVencer()).resolves.toEqual([]);
    spy.mockRestore();
  });
});
