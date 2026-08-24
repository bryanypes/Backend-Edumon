import { vi } from 'vitest';

// ─── Cloudinary ───────────────────────────────────────────────────────────────
// subirImagenCloudinary/subirArchivoCloudinary solo leen result.secure_url,
// result.public_id y result.format — replicamos esa forma.
export const cloudinaryUploadMock = vi.fn(async (_dataUri, options = {}) => {
  const folder = options.folder || 'general';
  const id = `${folder}/mock-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  return {
    secure_url: `https://res.cloudinary.com/test-cloud/${options.resource_type || 'image'}/upload/v1/${id}.jpg`,
    public_id: id,
    format: 'jpg',
  };
});

export const cloudinaryDestroyMock = vi.fn(async () => ({ result: 'ok' }));
export const cloudinaryResourcesMock = vi.fn(async () => ({ resources: [] }));
export const cloudinaryResourceMock = vi.fn(async () => ({}));

// ─── Firebase Admin (FCM) ─────────────────────────────────────────────────────
export const fcmSendMock = vi.fn(async () => 'mock-fcm-message-id');
export const fcmSendMulticastMock = vi.fn(async () => ({
  successCount: 0,
  failureCount: 0,
  responses: [],
}));

// ─── Twilio (WhatsApp) ────────────────────────────────────────────────────────
export const twilioCreateMock = vi.fn(async () => ({ sid: 'mock-twilio-sid' }));

// ─── Axios (Brevo / MailerSend HTTP) ──────────────────────────────────────────
export const axiosPostMock = vi.fn(async () => ({ data: { messageId: 'mock-message-id' } }));
