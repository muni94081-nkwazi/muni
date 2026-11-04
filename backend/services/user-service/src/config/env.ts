import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),

  databaseUrl: required('DATABASE_URL'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  passwordReset: {
    ttlMinutes: parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? '30', 10),
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'kafka:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'user-service',
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),

  /** Cap on saved addresses per user — stops an automated account filling the table. */
  maxAddressesPerUser: parseInt(process.env.MAX_ADDRESSES_PER_USER ?? '20', 10),
} as const;

export default env;
