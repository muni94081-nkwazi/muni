import * as Sentry from '@sentry/react';

// ─── Error tracking (browser) ─────────────────────────────────────────────────
//
// Entirely opt-in: with no VITE_SENTRY_DSN, `initSentry` does nothing and every
// helper below is a no-op. That is the normal state in development and in any
// deployment that does not use Sentry — it must never be a startup failure.
//
// The scrubbing mirrors backend/shared/observability/sentry.ts. It matters more
// here, not less: the browser holds the access and refresh tokens in
// localStorage, puts them in an Authorization header on every request, and a
// social login lands on a URL carrying a one-time exchange code.

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
 * Strip credentials that ride in a URL.
 *
 * `code` is the OAuth exchange code the callback lands with, and `state` the
 * handshake nonce. Both are single-use and short-lived, but an event is written
 * the instant the error happens — well inside their lifetime.
 */
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitive(key) || key === 'code' || key === 'state') {
        parsed.searchParams.set(key, REDACTED);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

let enabled = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Would attach IP addresses and cookies wholesale. Off; the scrubbing
    // below is the belt to that braces.
    sendDefaultPii: false,
    // Session Replay is deliberately NOT enabled. It records the DOM, which on
    // these screens means password fields, one-time codes and the contents of
    // a shopper's cart and order history. Turning it on is a privacy decision
    // that needs masking rules written first, not a default.

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
      // Console breadcrumbs are dropped, not scrubbed. The browser SDK turns
      // every console.* call into one, arguments included, and redacting
      // arbitrary log prose is guesswork — the backend's first attempt at it
      // redacted the word "OTP" and left the six digits after it. Console
      // output is already visible in the browser's own console; duplicating it
      // into Sentry only adds an exfiltration path.
      if (breadcrumb.category === 'console') return null;

      // fetch/xhr breadcrumbs carry the request URL, and navigation breadcrumbs
      // carry both the URL left and the URL arrived at — the OAuth callback
      // shows up in all three.
      if (typeof breadcrumb.data?.url === 'string') {
        breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
      }
      if (typeof breadcrumb.data?.from === 'string') {
        breadcrumb.data.from = scrubUrl(breadcrumb.data.from);
      }
      if (typeof breadcrumb.data?.to === 'string') {
        breadcrumb.data.to = scrubUrl(breadcrumb.data.to);
      }
      return breadcrumb;
    },
  });

  enabled = true;
}

export function sentryEnabled(): boolean {
  return enabled;
}

/** Report a caught error. No-op when Sentry is not configured. */
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
  // Id only. The email is on the User object and would be PII in a third-party
  // system for no diagnostic gain the id does not already give.
  Sentry.setUser(userId ? { id: userId } : null);
}

export const __testing = { scrub, scrubUrl, isSensitive };
