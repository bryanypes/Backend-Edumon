import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  fcmSendMock,
  fcmSendMulticastMock,
  nodemailerSendMailMock,
} from './mocks.js';

// ─── Variables de entorno de prueba ───────────────────────────────────────────
// falsas pero con forma válida; los SDKs que las usan están mockeados abajo
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.FRONTEND_URL = '';
process.env.FIREBASE_PROJECT_ID = 'edumon-test';
process.env.FIREBASE_CLIENT_EMAIL = 'test@edumon-test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n';
process.env.SMTP_HOST = 'smtp.test.edumon.local';
process.env.SMTP_PORT = '587';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'no-reply@test.edumon.local';
process.env.SMTP_PASS = 'test-smtp-password';
process.env.SMTP_FROM_NAME = 'Edumon Test';
process.env.SMTP_FROM_EMAIL = 'no-reply@test.edumon.local';

// almacenamiento local de archivos: carpeta temporal aislada por corrida
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `edumon-test-uploads-${process.pid}`);

// ─── Mocks globales de SDKs externos ──────────────────────────────────────────
// registrados aquí para que apliquen a todo el árbol de módulos sin mockear por archivo
vi.mock('firebase-admin', () => {
  const messaging = () => ({
    send: fcmSendMock,
    sendEachForMulticast: fcmSendMulticastMock,
  });
  const admin = {
    apps: [],
    initializeApp: vi.fn(),
    credential: { cert: vi.fn() },
    messaging,
  };
  return { default: admin };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: nodemailerSendMailMock })),
  },
}));

// ─── Ciclo de vida de Mongo (mongodb-memory-server) ───────────────────────────
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);

  // igual que server.js: registra los observers, si no los eventos de dominio no notifican nada en los tests.
  // import dinámico a propósito: uno estático arrastraría nodemailer/firebase
  // antes de tiempo y rompería el hoisting de los vi.mock() de arriba (TDZ)
  const { registrarObservers } = await import('../../src/events/NotificacionObservers.js');
  registrarObservers();

  // stub de Socket.IO para tests unitarios sin app real; integración/sockets usan la instancia real
  global.io = {
    to: () => ({ emit: () => {} }),
    emit: () => {},
  };
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
  vi.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});
