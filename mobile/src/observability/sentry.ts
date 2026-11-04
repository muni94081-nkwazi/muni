import * as Sentry from '@sentry/react-native';

// ─── Error tracking (native) ──────────────────────────────────────────────────
//
// Entirely opt-in: with no EXPO_PUBLIC_SENTRY_DSN, `initSentry` does nothing and
// every helper below is a no-op. That is the normal state in development and in
// any build that does not use Sentry.
//
// Mobile is where crash reporting earns its keep: a native crash gives the user
// no error message to report and leaves nothing in a server log, so without
// this it is invisible. The trade is that the SDK sees a great deal — which is
// why the scrubbing below mirrors the web and backend copies.

const SENSITIVE_KEY_PATTERNS = [
  'authorization',
  'cookie',
  'token',
  'password',
  'secret',
  'otp',
  'apikey',
  'challengetoken',
  'enrollmenttoken',
];

const REDACTED = '[redacted]';

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitive(key) ? REDACTED : scrub(nested, depth + 1);
  }
  return out;
}

/**
 * Strip credentials from a URL.
 *
 * The OAuth deep link is the case that matters: `muni://auth/callback?code=…`
 * carries the one-time exchange code, and a failure during that handoff is
 * exactly when an event gets written.
 */
function scrubUrl(url: string): string {
  const [base, query] = url.split('?');
  if (!query) return url;

  const scrubbed = query
    .split('&')
    .map((pair) => {
      const [key] = pair.split('=');
      return isSensitive(key) || key === 'code' || key === 'state'
        ? `${key}=${REDACTED}`
        : pair;
    })
    .join('&');

  return `${base}?${scrubbed}`;
}

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_ENV ?? 'development',
    tracesSampleRate: Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubUrl(event.request.url);
      if (event.request?.headers) {
        event.request.headers = scrub(event.request.headers) as Record<string, string>;
      }
      if (event.request?.data) event.request.data = scrub(event.request.data);
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // Dropped, not scrubbed — same reasoning as the backend and web copies.
      // Redacting arbitrary log prose is guesswork; not capturing it is not.
      if (breadcrumb.category === 'console') return null;

      if (typeof breadcrumb.data?.url === 'string') {
        breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
      }
      return breadcrumb;
    },
  });

  enabled = true;
}

export function sentryEnabled(): boolean {
  return enabled;
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(scrub(context) as Record<string, unknown>);
    Sentry.captureException(error);
  });
}

/** Attach the signed-in user to subsequent events; pass null on sign-out. */
export function setSentryUser(userId: string | null): void {
  if (!enabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export const __testing = { scrub, scrubUrl, isSensitive };
