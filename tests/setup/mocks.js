import { vi } from 'vitest';

// ─── Firebase Admin (FCM) ─────────────────────────────────────────────────────
export const fcmSendMock = vi.fn(async () => 'mock-fcm-message-id');
export const fcmSendMulticastMock = vi.fn(async () => ({
  successCount: 0,
  failureCount: 0,
  responses: [],
}));

// ─── Nodemailer (SMTP) ─────────────────────────────────────────────────────────
export const nodemailerSendMailMock = vi.fn(async () => ({ messageId: 'mock-message-id' }));
