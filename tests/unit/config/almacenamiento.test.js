import { describe, it, expect, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';

// Regresión: si UPLOAD_DIR no es escribible por el proceso (permisos del
// volumen montado en Docker, o simplemente no existe una ruta válida), crear
// las carpetas pub/priv al importar el módulo NO debe tirar el proceso abajo.
// Esto corre antes de app.listen() — un throw aquí impide que el backend
// llegue a abrir el puerto, y nginx responde 502 en todas las rutas.
describe('almacenamiento (carga del módulo con UPLOAD_DIR inválido)', () => {
  const originalUploadDir = process.env.UPLOAD_DIR;

  afterEach(() => {
    process.env.UPLOAD_DIR = originalUploadDir;
    vi.resetModules();
  });

  it('no lanza si UPLOAD_DIR apunta a una ruta donde no se puede crear un directorio', async () => {
    // un archivo real como "directorio padre": mkdir(<archivo>/pub) falla con ENOTDIR
    process.env.UPLOAD_DIR = path.join(os.tmpdir(), `edumon-not-a-dir-${process.pid}`);
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.UPLOAD_DIR, 'no soy un directorio');

    vi.resetModules();
    await expect(import('../../../src/config/almacenamiento.js')).resolves.toBeDefined();

    fs.rmSync(process.env.UPLOAD_DIR, { force: true });
  });

  it('sigue funcionando normalmente con una ruta válida', async () => {
    const dir = path.join(os.tmpdir(), `edumon-valid-upload-dir-${process.pid}`);
    process.env.UPLOAD_DIR = dir;

    vi.resetModules();
    const mod = await import('../../../src/config/almacenamiento.js');
    expect(mod.UPLOAD_DIR).toBe(dir);

    const fs = await import('node:fs');
    expect(fs.existsSync(path.join(dir, 'pub'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'priv'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
