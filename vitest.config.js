import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup/vitest.setup.js'],
    // Los tests de integración comparten una sola BD en memoria por archivo,
    // así que se corren en serie dentro de cada archivo (evita choques entre
    // beforeEach/afterEach de distintos tests) pero en paralelo entre archivos.
    fileParallelism: true,
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/index.js',
        'src/server.js',
        'src/scripts/**',
        'src/uploads/**',
      ],
    },
  },
});
