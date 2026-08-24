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
  axiosPostMock,
} from './mocks.js';

// ─── Variables de entorno de prueba ───────────────────────────────────────────
// Deterministas y sin credenciales reales — todos los SDKs externos que las
// usan están mockeados abajo, así que ninguna llamada a estas "credenciales"
// llega jamás a una red real.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.FRONTEND_URL = '';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-cloud-key';
process.env.CLOUDINARY_API_SECRET = 'test-cloud-secret';
process.env.FIREBASE_PROJECT_ID = 'edumon-test';
process.env.FIREBASE_CLIENT_EMAIL = 'test@edumon-test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n';
process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
process.env.VAPID_EMAIL = 'mailto:test@edumon.local';
process.env.TWILIO_ACCOUNT_SID = 'ACtestaccountsid0000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
process.env.BREVO_API_KEY = 'test-brevo-api-key';
process.env.BREVO_SENDER_EMAIL = 'no-reply@test.edumon.local';
process.env.BREVO_SENDER_NAME = 'Edumon Test';

// ─── Mocks globales de SDKs externos ──────────────────────────────────────────
// Registrados en el setup file para que apliquen a TODO el árbol de módulos de
// cada archivo de test (controllers, services, strategies) sin tener que
// mockear en cada archivo. Ningún test golpea Cloudinary/Firebase/Twilio/Brevo
// reales — así corren rápido, deterministas, y sin secretos en CI.
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

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock,
    get: vi.fn(async () => ({ data: {} })),
  },
}));

// ─── Ciclo de vida de Mongo (mongodb-memory-server) ───────────────────────────
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);

  // Igual que server.js en producción: registra los observers UNA vez por
  // archivo de test (cada archivo tiene su propio registro de módulos/eventBus
  // aislado). Sin esto, publicar un evento (tarea creada, entrega calificada,
  // mensaje de buzón...) no dispara ninguna notificación real en los tests de
  // integración — exactamente el comportamiento de producción si server.js no
  // llamara a esto al arrancar.
  // Import dinámico (no estático arriba del archivo) a propósito: así se
  // resuelve después de que los vi.mock() de este archivo ya evaluaron, sin
  // importar el orden de las líneas — un import estático de NotificacionObservers.js
  // arrastra axios/cloudinary/firebase-admin/twilio antes de tiempo y rompe el
  // hoisting de vi.mock (TDZ sobre las variables mockeadas de mocks.js).
  const { registrarObservers } = await import('../../src/events/NotificacionObservers.js');
  registrarObservers();

  // Stub por defecto de Socket.IO para tests unitarios que no levantan un app
  // real (ej. NotificadorFacade). Los tests de integración/sockets reemplazan
  // esto con la instancia real que crea crearApp().
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
