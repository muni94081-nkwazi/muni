import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4007),

  databaseUrl: required('DATABASE_URL'),

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'notification-service',
  },

  userServiceUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
  serviceTimeoutMs: Number(process.env.SERVICE_TIMEOUT_MS ?? 5_000),

  // ── Delivery behaviour ────────────────────────────────────────────────────
  delivery: {
    maxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS ?? 4),
    /// Base for exponential backoff: 30s, 60s, 120s, …
    retryBaseSeconds: Number(process.env.NOTIFICATION_RETRY_BASE_SECONDS ?? 30),
    /// How often the retry worker sweeps for due deliveries.
    retryIntervalMs: Number(process.env.NOTIFICATION_RETRY_INTERVAL_MS ?? 60_000),
    retryBatchSize: Number(process.env.NOTIFICATION_RETRY_BATCH ?? 50),
    /// With no provider credentials configured, log the message instead of
    /// sending it. Lets the whole pipeline run end-to-end locally without
    /// silently pretending a real send happened in production.
    dryRun: bool('NOTIFICATION_DRY_RUN', false),
  },

  // ── SMS: Africa's Talking ─────────────────────────────────────────────────
  // Primary SMS route for Uganda/Zambia — local shortcodes and per-country
  // sender IDs, which is what makes delivery rates acceptable in-market.
  africasTalking: {
    enabled: bool('AT_ENABLED', false),
    apiKey: process.env.AT_API_KEY ?? '',
    username: process.env.AT_USERNAME ?? 'sandbox',
    senderId: process.env.AT_SENDER_ID ?? '',
    baseUrl:
      process.env.AT_BASE_URL ??
      (process.env.AT_USERNAME === 'sandbox'
        ? 'https://api.sandbox.africastalking.com'
        : 'https://api.africastalking.com'),
  },

  // ── SMS + WhatsApp: Twilio ────────────────────────────────────────────────
  twilio: {
    enabled: bool('TWILIO_ENABLED', false),
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
    /// Must be a WhatsApp-enabled sender, in "whatsapp:+123..." form.
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? '',
    baseUrl: process.env.TWILIO_BASE_URL ?? 'https://api.twilio.com',
  },

  // ── Push: Firebase Cloud Messaging (HTTP v1) ──────────────────────────────
  fcm: {
    enabled: bool('FCM_ENABLED', false),
    projectId: process.env.FCM_PROJECT_ID ?? '',
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    /// PEM private key. In .env it is one line with literal \n escapes, which
    /// are unescaped here.
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\n/g, '\n'),
  },

  // ── Email: SMTP ───────────────────────────────────────────────────────────
  smtp: {
    enabled: bool('SMTP_ENABLED', false),
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? 'MUNI <no-reply@muni.example>',
  },

  /// Default country for msisdn normalisation when a stored number is local
  /// format (07…) with no country code. ISO 3166-1 alpha-2.
  defaultCountry: process.env.DEFAULT_COUNTRY ?? 'UG',

  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export default env;
