import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4032),

  databaseUrl: required('DATABASE_URL'),

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'support-service',
  },

  userServiceUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
  orderServiceUrl: process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003',

  // ── SLA targets, in hours, by priority ───────────────────────────────────
  // First response is tracked separately from resolution because it is the
  // commitment that can actually be kept during a backlog, and the one
  // requesters judge the platform on.
  sla: {
    firstResponseHours: {
      URGENT: Number(process.env.SLA_FIRST_RESPONSE_URGENT ?? 1),
      HIGH: Number(process.env.SLA_FIRST_RESPONSE_HIGH ?? 4),
      NORMAL: Number(process.env.SLA_FIRST_RESPONSE_NORMAL ?? 24),
      LOW: Number(process.env.SLA_FIRST_RESPONSE_LOW ?? 48),
    },
    resolutionHours: {
      URGENT: Number(process.env.SLA_RESOLUTION_URGENT ?? 8),
      HIGH: Number(process.env.SLA_RESOLUTION_HIGH ?? 24),
      NORMAL: Number(process.env.SLA_RESOLUTION_NORMAL ?? 72),
      LOW: Number(process.env.SLA_RESOLUTION_LOW ?? 120),
    },
    /// How often the sweeper flags newly breached tickets.
    sweepIntervalMs: Number(process.env.SLA_SWEEP_INTERVAL_MS ?? 300_000),
  },

  /// Days after resolution before a ticket auto-closes and stops accepting replies.
  autoCloseAfterDays: Number(process.env.TICKET_AUTO_CLOSE_DAYS ?? 7),

  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export default env;
