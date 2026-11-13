import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // misma zona horaria que producción y el CI (contenedores en UTC): así los
    // errores de fecha UTC vs America/Bogota también aparecen en local
    env: { TZ: 'UTC' },
    globals: false,
    setupFiles: ['./tests/setup/vitest.setup.js'],
    // en serie dentro de cada archivo (comparten una BD en memoria), en paralelo entre archivos
    fileParallelism: true,
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/index.js', 'src/server.js', 'src/scripts/**'],
    },
  },
});
