import cors from 'cors';
import type { RequestHandler } from 'express';

// ─── Internal CORS ────────────────────────────────────────────────────────────
//
// Every service behind the gateway used to mount a bare `app.use(cors())`.
// Called with no options the middleware reflects whatever `Origin` the request
// carried and answers every preflight with `Access-Control-Allow-Origin: *` —
// which is the opposite of what these services need. They are reached
// server-to-server by the gateway; a browser has no business talking to them
// directly, so there is no origin worth allowing.
//
// That default is only harmless while nothing but the gateway can reach the
// port. Compose publishes 4001-4033 on the host, and a NetworkPolicy typo does
// the same in a cluster — at which point open CORS is what lets a page on any
// origin read the response instead of the browser discarding it.
//
// Note what this does and does not buy: CORS is a browser control, not an
// access control. It stops a *browser on another origin* from reading
// responses. It does nothing against curl, a server-side proxy, or anything
// else that ignores the same-origin policy — those are the gateway's and the
// network's job, and `requireAuth` in ./service-auth.middleware.ts remains the
// actual authorization boundary.

/**
 * CORS for a service that should only ever be called server-to-server.
 *
 * `origin: false` sends no `Access-Control-Allow-*` headers at all, so a
 * cross-origin browser request is rejected by the browser itself. Same-origin
 * and non-browser callers (the gateway included) are unaffected — they never
 * consult these headers.
 *
 * Mount this instead of `cors()` in every service except auth-service, which
 * terminates OAuth redirects in a real browser and needs `browserCors` below.
 */
export const internalCors = (): RequestHandler => cors({ origin: false });

/**
 * CORS for the one service a browser talks to on its own: auth-service, whose
 * OAuth callbacks land in the address bar rather than in fetch().
 *
 * Reads CORS_ORIGINS — plural, comma-separated — which is the name the gateway
 * and the five config-driven services already use, fed from PUBLIC_ORIGIN in
 * docker-compose.yml. A singular CORS_ORIGIN here would be a second name for
 * the same concept that silently reads as unset everywhere it was not set.
 *
 * `credentials: true` is required for the httpOnly refreshToken cookie to ride
 * along, and the CORS spec forbids pairing that with a `*` origin, so the
 * allowlist is not optional here even if we wanted it to be.
 *
 * Values must be the origin the *browser* uses (https://muni.ug in production,
 * the nginx edge in dev) — never an internal container hostname, which no
 * browser ever sends. The dev fallback covers both ways the stack gets reached
 * locally: through nginx on :80, and straight at the gateway on :8080.
 */
export function browserCors(): RequestHandler {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = configured.length > 0
    ? configured
    : ['http://localhost', 'http://localhost:8080'];

  return cors({
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID'],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  });
}
