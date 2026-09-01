import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  cloudinaryUploadMock,
  cloudinaryDestroyMock,
  cloudinaryResourcesMock,
  cloudinaryResourceMock,
  fcmSendMock,
  fcmSendMulticastMock,
  twilioCreateMock,
  nodemailerSendMailMock,
} from './mocks.js';

// ─── Variables de entorno de prueba ───────────────────────────────────────────
// falsas pero con forma válida; los SDKs que las usan están mockeados abajo
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.FRONTEND_URL = '';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-cloud-key';
process.env.CLOUDINARY_API_SECRET = 'test-cloud-secret';
process.env.FIREBASE_PROJECT_ID = 'edumon-test';
process.env.FIREBASE_CLIENT_EMAIL = 'test@edumon-test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n';
process.env.TWILIO_ACCOUNT_SID = 'ACtestaccountsid0000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
process.env.SMTP_HOST = 'smtp.test.edumon.local';
process.env.SMTP_PORT = '587';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'no-reply@test.edumon.local';
process.env.SMTP_PASS = 'test-smtp-password';
process.env.SMTP_FROM_NAME = 'Edumon Test';
process.env.SMTP_FROM_EMAIL = 'no-reply@test.edumon.local';

// ─── Mocks globales de SDKs externos ──────────────────────────────────────────
// registrados aquí para que apliquen a todo el árbol de módulos sin mockear por archivo
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload: cloudinaryUploadMock,
      destroy: cloudinaryDestroyMock,
    },
    api: {
      resources: cloudinaryResourcesMock,
      resource: cloudinaryResourceMock,
    },
  },
}));

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

vi.mock('twilio', () => {
  const twilioFactory = vi.fn(() => ({
    messages: { create: twilioCreateMock },
  }));
  return { default: twilioFactory };
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
  // import dinámico a propósito: uno estático arrastraría nodemailer/cloudinary/firebase/twilio
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
});
