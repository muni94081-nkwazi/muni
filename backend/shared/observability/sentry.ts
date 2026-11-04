import * as Sentry from '@sentry/node';

// ─── Error tracking ───────────────────────────────────────────────────────────
//
// Shared by every Node service, so scrubbing is written once. Getting that
// wrong in one service is enough to leak credentials, and "which fields does
// this service redact" is not a question anyone should have to answer per
// service.
//
// Entirely opt-in: with no SENTRY_DSN set, `initSentry` does nothing and every
// capture helper below is a no-op. A missing DSN is the normal state in
// development and in any deployment that does not use Sentry — it must never
// be a startup failure or a source of noise.

/**
 * Request headers and body fields that must never leave the process.
 *
 * Matched case-insensitively as substrings, so `x-internal-identity`,
 * `refreshToken` and `newPassword` are all caught without listing every
 * spelling. Deliberately broad: a false positive costs a redacted field in a
 * stack trace, a false negative puts a live credential in a third-party SaaS.
 */
const SENSITIVE_KEY_PATTERNS = [
  'authorization',
  'cookie',
  'token',
  'password',
  'secret',
  'otp',
  'passwordhash',
  'apikey',
  'api-key',
  'x-internal-identity',
  'x-user-id',
  'code_verifier',
  'client_secret',
  'challengetoken',
  'enrollmenttoken',
];

const REDACTED = '[redacted]';

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Recursively redact sensitive values in place-ish (returns a new structure).
 *
 * Depth-limited because Sentry payloads can carry deeply nested or cyclic
 * objects, and an unbounded walk in an error path is its own outage.
 */
/** Keys whose STRING value is a URL, and so needs its query string cleaned
 *  rather than the whole value redacted. `url`, `requestUrl`, `redirect_uri`. */
function isUrlKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === 'url' || lower.endsWith('url') || lower.endsWith('uri');
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitive(key)) {
      out[key] = REDACTED;
    } else if (isUrlKey(key) && typeof nested === 'string') {
      // Key-based redaction alone is not enough for a URL: the key (`url`) is
      // innocuous while the value carries the OAuth `code` or `state` in its
      // query string. Redacting the whole thing would throw away the path,
      // which is the useful half — so the query is cleaned instead.
      //
      // beforeSend already does this for `event.request.url`, but a URL can
      // also arrive nested in `contexts` or `extra`, and those went through
      // untouched until this branch existed.
      out[key] = scrubUrl(nested);
    } else {
      out[key] = scrub(nested, depth + 1);
    }
  }
  return out;
}

/**
 * Strip credentials that ride in a URL rather than in a header or body.
 *
 * The OAuth callback legs are the reason this exists: a redeemed `code`, and —
 * for anything still on an older client — `access_token` / `refresh_token`.
 * Sentry records the request URL on every event, so without this the exact
 * values the exchange-code change removed from logs would come straight back
 * via the error tracker.
 */
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://placeholder.invalid');
    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitive(key) || key === 'code' || key === 'state') {
        parsed.searchParams.set(key, REDACTED);
      }
    }
    return url.startsWith('http') ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

let enabled = false;

/**
 * Wire up error tracking for a service. Safe to call unconditionally at boot.
 *
 * @param serviceName reported as the `service` tag, so events from 34 services
 *                    are separable without reading stack traces.
 */
export function initSentry(serviceName: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION,

    // ── Integrations removed on purpose ──────────────────────────────────────
    //
    // Both are ON BY DEFAULT in @sentry/node, and both were found by asserting
    // on a real captured envelope rather than by reading the docs — which is
    // the argument for sentry.pipeline.test.ts existing at all.
    //
    // `LocalVariables` attaches the VALUES of local variables to each stack
    // frame. On this service those locals are `input.password` in login(),
    // `rawToken` in refresh(), `otp` in resetPassword() and `codeVerifier` in
    // the OAuth exchange. beforeSend cannot save us there: the values sit
    // inside the stacktrace frame structure, not in the request or extra fields
    // the scrubber walks.
    //
    // `Console` turns every console.* call into a breadcrumb, arguments and
    // all. auth.service logs a password-reset OTP in non-production, and the
    // gateway and services log freely. The first attempt at handling this
    // regex-scrubbed the breadcrumb text — and a test immediately showed it
    // redacting the WORD "OTP" while leaving the six digits that followed the
    // email address. Scrubbing arbitrary prose is guesswork; not capturing it
    // is not. Console output already reaches the log aggregator, so this
    // removes a duplicate exfiltration path rather than any real signal.
    //
    // `ContextLines` is deliberately KEPT. It attaches the source lines around
    // each frame, which means this service's source is transmitted to Sentry —
    // acceptable, since it is not a credential and it is what makes a stack
    // trace readable. Worth knowing it happens.
    integrations: (defaults) =>
      defaults.filter(
        (integration) => integration.name !== 'LocalVariables' && integration.name !== 'Console',
      ),
    // Traces cost money and volume; sampled low by default and tunable per
    // deployment rather than hardcoded.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // sendDefaultPii would attach request bodies, headers and IPs wholesale.
    // Off, and the scrubbing below is the belt to that braces.
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        if (event.request.headers) {
          event.request.headers = scrub(event.request.headers) as Record<string, string>;
        }
        if (event.request.data) event.request.data = scrub(event.request.data);
        if (event.request.cookies) event.request.cookies = { [REDACTED]: REDACTED };
        if (event.request.query_string) event.request.query_string = REDACTED;
        if (event.request.url) event.request.url = scrubUrl(event.request.url);
      }

      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;

      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data?.url && typeof breadcrumb.data.url === 'string') {
        breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
      }

      // Console breadcrumbs are dropped outright rather than scrubbed — the
      // Console integration is disabled above, and this is the belt to that
      // braces in case a future SDK re-enables it by default.
      if (breadcrumb.category === 'console') return null;

      return breadcrumb;
    },
  });

  Sentry.setTag('service', serviceName);
  enabled = true;
  console.log(`[${serviceName}] ✅ Sentry error tracking enabled`);
}

/** True when a DSN was configured and init succeeded. */
export function sentryEnabled(): boolean {
  return enabled;
}

/**
 * Report an error, attaching whichever request context is safe to keep.
 *
 * No-op when Sentry is not configured, so call sites need no guard of their own.
 */
export function captureError(
  error: unknown,
  context?: { route?: string; method?: string; status?: number; userId?: string },
): void {
  if (!enabled) return;

  Sentry.withScope((scope) => {
    if (context?.route) scope.setTag('route', context.route);
    if (context?.method) scope.setTag('method', context.method);
    if (context?.status) scope.setTag('status', String(context.status));
    // The user id is an opaque UUID, not PII on its own, and it is the single
    // most useful thing for correlating an error with a support report.
    if (context?.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}

/** Flush buffered events before the process exits, so a crash is not lost. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Shutting down anyway — a failed flush must not block it.
  }
}

export { Sentry };

// Exported for the scrubbing tests, which are the only reason to reach in here.
export const __testing = { scrub, scrubUrl, isSensitive };
