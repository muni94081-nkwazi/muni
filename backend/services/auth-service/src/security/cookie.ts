import type { CookieOptions } from 'express';

/**
 * Options for the httpOnly `refreshToken` cookie.
 *
 * This cookie is what makes one login carry across the three same-domain
 * frontends (customer-web at /, seller-center at /seller/, admin-panel at
 * /admin/), so its attributes are deployment-topology sensitive:
 *
 * - `path: '/'` — must cover all three mount points, not just /api.
 * - `sameSite: 'strict'` — safe precisely because every app and the API share
 *   one origin behind nginx. It would have to be relaxed to 'lax'/'none' if the
 *   apps were ever split back onto separate subdomains.
 * - `secure` — read from COOKIE_SECURE rather than inferred from NODE_ENV.
 *   A browser silently refuses to send a Secure cookie over plain http, so
 *   tying it to NODE_ENV=production breaks auth on any production-mode deploy
 *   that has not terminated TLS yet (a bare `docker compose up` on
 *   http://localhost being the normal case). Set COOKIE_SECURE=true once the
 *   deployment is actually behind HTTPS.
 */
export function refreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
