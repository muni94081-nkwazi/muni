import type { NextFunction, Request, Response } from 'express';
import { readAccessToken } from '../../../shared/utils/token.js';
import { signIdentity, INTERNAL_IDENTITY_HEADER } from '../../../shared/utils/internal-identity.js';

// ─── Auth Middleware ───────────────────────────────────────────────────────────
//
//   stripClientIdentity(req, res, next)
//     • Deletes every identity header a client could have sent.
//     • MUST run before anything else that reads them (logging, rate limiting,
//       routing). See the note on trust below.
//
//   optionalAuth(req, res, next)
//     • Decodes the JWT if present, stamps x-user-id + x-user-roles headers,
//       and mints a signed x-internal-identity assertion for downstream use.
//     • Never rejects — unauthenticated requests pass through (rate-limited
//       at the anonymous tier by the rate-limiter).
//
//   requireAuth(req, res, next)
//     • Returns 401 if no valid JWT was presented.
//
//   requireRole(...roles)(req, res, next)
//     • Returns 403 if the authenticated user lacks at least one of the roles.
//     • Always implies requireAuth (401 first, then 403).
//
// ─── Why stripClientIdentity exists ───────────────────────────────────────────
//
// Downstream services trust x-user-id / x-user-roles and do NOT re-validate
// the JWT. That is a reasonable design *only* if those headers cannot originate
// with the caller. They can: Express merges inbound headers into req.headers,
// and the proxy forwards req.headers verbatim to the upstream service. Without
// an explicit strip, `curl -H 'x-user-roles: ROLE_SUPER_ADMIN'` is a complete
// authentication and authorization bypass on every route.
//
// So: delete first, then re-stamp only from a signature we verified ourselves.

/**
 * Identity headers the gateway owns. Anything a client sends under these names
 * is forged by definition — the gateway is the only legitimate source.
 */
const GATEWAY_OWNED_HEADERS = [
  'x-user-id',
  'x-user-roles',
  'x-user-email',
  'x-internal-call',
  INTERNAL_IDENTITY_HEADER,
] as const;

export function stripClientIdentity(req: Request, _res: Response, next: NextFunction): void {
  for (const header of GATEWAY_OWNED_HEADERS) {
    delete req.headers[header];
  }
  next();
}

/** Stamp the verified identity onto the request for downstream consumers. */
function stampIdentity(req: Request, sub: string, roles: string[]): void {
  req.headers['x-user-id']    = sub;
  req.headers['x-user-roles'] = roles.join(',');

  // Signed assertion — null when INTERNAL_IDENTITY_SECRET is unset, in which
  // case services fall back to the (stripped) plain headers.
  const assertion = signIdentity(sub, roles);
  if (assertion) req.headers[INTERNAL_IDENTITY_HEADER] = assertion;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token    = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const identity = readAccessToken(token);

  if (identity) stampIdentity(req, identity.sub, identity.roles);

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Safe to trust: stripClientIdentity removed any client-supplied value, so
  // this header is present only if optionalAuth verified a signature.
  if (req.headers['x-user-id']) return next();

  const token    = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const identity = readAccessToken(token);

  if (!identity) {
    res.status(401).json({
      success: false,
      data:    null,
      error:   { code: 'UNAUTHORIZED', message: 'Authentication required. Please log in.' },
      meta:    { correlationId: req.headers['x-correlation-id'] ?? null, timestamp: new Date().toISOString(), service: 'api-gateway' },
    });
    return;
  }

  stampIdentity(req, identity.sub, identity.roles);
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Must be authenticated first
    if (!req.headers['x-user-id']) {
      res.status(401).json({
        success: false,
        data:    null,
        error:   { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        meta:    { correlationId: req.headers['x-correlation-id'] ?? null, timestamp: new Date().toISOString(), service: 'api-gateway' },
      });
      return;
    }

    const userRoles = (req.headers['x-user-roles'] as string | undefined)?.split(',') ?? [];
    const hasRole   = roles.some((r) => userRoles.includes(r));

    if (!hasRole) {
      res.status(403).json({
        success: false,
        data:    null,
        error:   { code: 'FORBIDDEN', message: `Access denied. Requires one of: ${roles.join(', ')}` },
        meta:    { correlationId: req.headers['x-correlation-id'] ?? null, timestamp: new Date().toISOString(), service: 'api-gateway' },
      });
      return;
    }

    next();
  };
}
