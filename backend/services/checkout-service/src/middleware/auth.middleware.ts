import type { NextFunction, Request, Response } from 'express';
import {
  verifyIdentity,
  isInternalIdentityEnabled,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';

// ─── Service Auth ─────────────────────────────────────────────────────────────
//
// Two modes, chosen by whether INTERNAL_IDENTITY_SECRET is configured:
//
//   signed   — verify the gateway's short-lived assertion cryptographically.
//              Forging identity then requires the shared secret, not just
//              knowledge of a header name.
//   headers  — trust x-user-id / x-user-roles. Only sound while the gateway
//              strips them from inbound requests AND network policy prevents
//              anything else reaching this service. Kept so the secret can be
//              rolled out without a flag-day deploy.
//
// Prefer signed. The header mode exists for migration, not as a destination.

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isInternalIdentityEnabled()) {
    const identity = verifyIdentity(req.headers[INTERNAL_IDENTITY_HEADER] as string | undefined);
    if (!identity) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }
    res.locals.userId = identity.sub;
    res.locals.roles  = identity.roles;
    return next();
  }

  const userId = String(req.headers['x-user-id'] ?? '');
  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  res.locals.userId = userId;
  res.locals.roles  = String(req.headers['x-user-roles'] ?? '').split(',').filter(Boolean);
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Chain through requireAuth so roles come from a verified source, never
    // straight off the header.
    requireAuth(req, res, () => {
      const userRoles = (res.locals.roles as string[]) ?? [];
      if (!roles.some((r) => userRoles.includes(r))) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        });
        return;
      }
      next();
    });
  };
}
