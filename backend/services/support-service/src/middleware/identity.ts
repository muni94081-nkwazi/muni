import type { NextFunction, Request, RequestHandler, Response } from 'express';
import ApiError from '../utils/ApiError.js';
import {
  verifyIdentity,
  isInternalIdentityEnabled,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';

// ─── Identity ─────────────────────────────────────────────────────────────────
//
// Two things were wrong here, and the second hid the first.
//
// 1. Identity was read straight off `x-user-id` with no verification. That is
//    sound only while the gateway strips inbound identity headers AND nothing
//    else on the network can reach this service — the second has never been
//    enforced. When INTERNAL_IDENTITY_SECRET is configured, the assertion the
//    gateway signs is now verified instead, so forging identity needs the
//    secret rather than knowledge of a header name. The header path remains as
//    an explicit migration fallback when no secret is set.
//
// 2. The role came from `x-user-role` — singular. The gateway has only ever
//    stamped `x-user-roles`, plural and comma-separated
//    (api-gateway/src/middleware/auth.middleware.ts). So `role` fell through to
//    its 'CUSTOMER' default on every request, and every `requireRole('ADMIN')`
//    route in this service was unreachable by anyone, including a real admin.
//    `x-user-name` was likewise never sent, so `actor.name` was always
//    undefined.
//
// The `req.actor` shape is deliberately unchanged so no controller had to move.
//
// Roles are matched with or without the platform's `ROLE_` prefix: the gateway
// emits `ROLE_ADMIN`, while this service's routes ask for `'ADMIN'`.

declare global {
  namespace Express {
    interface Request {
      actor?: { id: string; role: string; roles: string[]; name?: string };
    }
  }
}

/** `ROLE_ADMIN` and `ADMIN` are the same role written two ways. */
function normalize(role: string): string {
  return role.trim().toUpperCase().replace(/^ROLE_/, '');
}

function identityFrom(req: Request): { id: string; roles: string[] } | null {
  if (isInternalIdentityEnabled()) {
    const verified = verifyIdentity(req.headers[INTERNAL_IDENTITY_HEADER] as string | undefined);
    return verified ? { id: verified.sub, roles: verified.roles ?? [] } : null;
  }

  const id = req.headers['x-user-id'] as string | undefined;
  if (!id) return null;
  return {
    id,
    roles: String(req.headers['x-user-roles'] ?? '').split(',').filter(Boolean),
  };
}

export function attachIdentity(req: Request, _res: Response, next: NextFunction): void {
  const identity = identityFrom(req);
  if (identity) {
    const roles = identity.roles.map(normalize);
    req.actor = {
      id:    identity.id,
      roles,
      // Kept for controllers that read a single role; the first is the
      // primary one the gateway listed.
      role:  roles[0] ?? 'CUSTOMER',
      name:  req.headers['x-user-name'] as string | undefined,
    };
  }
  next();
}

export function requireActor(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor?.id) return next(ApiError.unauthorized());
  next();
}

export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.actor?.id) return next(ApiError.unauthorized());
    const held = req.actor.roles ?? [];
    const wanted = roles.map(normalize);
    if (!wanted.some((r) => held.includes(r))) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }
    next();
  };
}
