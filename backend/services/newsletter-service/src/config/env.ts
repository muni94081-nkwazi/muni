import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4034),

  databaseUrl: required('DATABASE_URL'),

  /**
   * When true, a new address is written as CONFIRMED immediately. When false
   * (the default) it is written as PENDING and only becomes CONFIRMED once the
   * recipient follows a confirmation link — the double opt-in that most
   * jurisdictions expect for marketing email.
   *
   * There is no email delivery wired into this service yet, so a deployment
   * that flips this on without also sending confirmations would strand every
   * subscriber in PENDING. That is the honest default: capture the address and
   * the consent, and do not claim a confirmed subscription that nobody
   * confirmed.
   */
  singleOptIn: process.env.NEWSLETTER_SINGLE_OPT_IN === 'true',

  /** Max signup attempts per IP per window, to blunt list-bombing. */
  rateLimit: {
    windowMs: Number(process.env.NEWSLETTER_RATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.NEWSLETTER_RATE_MAX ?? 5),
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export default env;
