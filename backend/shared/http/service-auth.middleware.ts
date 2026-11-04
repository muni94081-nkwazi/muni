import type { NextFunction, Request, Response } from 'express';
import {
  verifyIdentity,
  isInternalIdentityEnabled,
  INTERNAL_IDENTITY_HEADER,
  type InternalIdentity,
} from '../utils/internal-identity.js';
import { isPlaceholderSecret, placeholderSecretMessage } from '../security/placeholder-secrets.js';

// ─── Service Auth ─────────────────────────────────────────────────────────────
//
// Shared by the money-path services (order, payment, inventory) so identity is
// resolved the same way in each, rather than three near-copies that drift.
//
// Two modes, chosen by whether INTERNAL_IDENTITY_SECRET is configured:
//
//   signed   — verify the short-lived assertion cryptographically. Forging
//              identity then requires the shared secret, not just knowledge of
//              a header name.
//   headers  — trust x-user-id / x-user-roles. Sound only while the gateway
//              strips them from inbound requests AND network policy keeps
//              anything else from reaching the service. Kept so the secret can
//              be rolled out without a flag-day deploy.
//
// Prefer signed. The header mode exists for migration, not as a destination —
// and `requireInternalCaller` below refuses to run in it at all.

/** Where the resolved identity lands, for handlers to read. */
export interface ResolvedIdentity {
  userId: string;
  roles:  string[];
  /** Which service vouched for this call, when it came from inside the mesh. */
  callingService?: string;
}

function deny(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, message, code });
}

function stash(res: Response, identity: ResolvedIdentity): void {
  res.locals.userId         = identity.userId;
  res.locals.roles          = identity.roles;
  res.locals.callingService = identity.callingService;
}

function readSigned(req: Request): InternalIdentity | null {
  return verifyIdentity(req.headers[INTERNAL_IDENTITY_HEADER] as string | undefined);
}

/**
 * Resolve the acting user. 401 when no identity can be established.
 *
 * Handlers must read `res.locals.userId` rather than `x-user-id`: in signed
 * mode the header is unverified noise, and reading it directly is what let a
 * forged header act as any user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isInternalIdentityEnabled()) {
    const identity = readSigned(req);
    if (!identity) {
      deny(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    stash(res, { userId: identity.sub, roles: identity.roles, callingService: identity.svc });
    return next();
  }

  const userId = String(req.headers['x-user-id'] ?? '');
  if (!userId) {
    deny(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  stash(res, {
    userId,
    roles: String(req.headers['x-user-roles'] ?? '').split(',').filter(Boolean),
  });
  next();
}

/**
 * Restrict a route to service-to-service callers.
 *
 * A valid signature is NOT sufficient. The gateway signs an assertion for
 * every authenticated browser request too, so checking only the signature
 * would leave an "internal only" route reachable by any logged-in customer.
 * The `svc` claim — set solely by `signServiceIdentity` — is what separates
 * the two.
 *
 * Fails closed when the secret is unset: without it nothing can be verified,
 * and quietly falling back to header trust would turn this guard into
 * decoration on exactly the routes that most need it.
 */
export function requireInternalCaller(req: Request, res: Response, next: NextFunction): void {
  if (!isInternalIdentityEnabled()) {
    deny(
      res,
      503,
      'INTERNAL_IDENTITY_UNCONFIGURED',
      'This endpoint requires signed internal identity, which is not configured on this service.',
    );
    return;
  }

  const identity = readSigned(req);
  if (!identity) {
    deny(res, 401, 'UNAUTHORIZED', 'A valid internal identity assertion is required');
    return;
  }

  if (!identity.svc) {
    deny(
      res,
      403,
      'INTERNAL_ONLY',
      'This endpoint is not callable directly. Start a checkout instead.',
    );
    return;
  }

  stash(res, { userId: identity.sub, roles: identity.roles, callingService: identity.svc });
  next();
}

/** Require one of `roles`, resolved from the verified identity. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const held = (res.locals.roles as string[]) ?? [];
      if (!roles.some((r) => held.includes(r))) {
        deny(res, 403, 'FORBIDDEN', 'Insufficient permissions');
        return;
      }
      next();
    });
  };
}

/**
 * Resolve identity when present, without requiring it. For routes that serve
 * both signed-in and anonymous callers.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  if (isInternalIdentityEnabled()) {
    const identity = readSigned(req);
    if (identity) {
      stash(res, { userId: identity.sub, roles: identity.roles, callingService: identity.svc });
    }
    return next();
  }

  const userId = String(req.headers['x-user-id'] ?? '');
  if (userId) {
    stash(res, {
      userId,
      roles: String(req.headers['x-user-roles'] ?? '').split(',').filter(Boolean),
    });
  }
  next();
}

// ─── Startup Guard ────────────────────────────────────────────────────────────

/**
 * Refuse to start a money-path service that cannot verify caller identity.
 *
 * The middleware above degrades to header trust when INTERNAL_IDENTITY_SECRET
 * is unset. That fallback is what makes a staged rollout possible, but it is
 * also completely silent: the service boots, every route answers 200, and the
 * only difference is that `x-user-id` is now a claim anybody can make. On
 * order-, payment- and checkout-service that is the difference between "placed
 * their own order" and "placed an order as anyone".
 *
 * So the mode is chosen explicitly by environment rather than by accident:
 *
 *   production        → fatal. Exit before binding a port, the same way the
 *                       gateway does, so the deploy fails loudly instead of
 *                       succeeding into the insecure mode.
 *   development/test  → warn and continue, so a fresh clone still runs.
 *
 * Call this first in the service's startup path, before `app.listen`.
 */
export function assertInternalIdentityConfigured(serviceName: string): void {
  const secret = process.env.INTERNAL_IDENTITY_SECRET;

  // Checked before isInternalIdentityEnabled(), which only measures length and
  // would happily wave through the 46-character placeholder this repo ships.
  if (process.env.NODE_ENV === 'production' && isPlaceholderSecret(secret)) {
    console.error(
      `[${serviceName}] ${placeholderSecretMessage('INTERNAL_IDENTITY_SECRET')}\n` +
      `          Refusing to start: an attacker who can read this repository could mint\n` +
      `          identity assertions for any user.`,
    );
    process.exit(1);
  }

  if (isInternalIdentityEnabled()) return;

  const problem = !secret
    ? 'INTERNAL_IDENTITY_SECRET is not set'
    : `INTERNAL_IDENTITY_SECRET is only ${secret.length} characters (minimum 32)`;

  if (process.env.NODE_ENV === 'production') {
    console.error(
      `[${serviceName}] ${problem}.\n` +
      `          Refusing to start: without it this service cannot verify the gateway's\n` +
      `          signed identity assertions and would fall back to trusting plain\n` +
      `          x-user-id headers — meaning anyone who can reach this port can act as\n` +
      `          any user.\n` +
      `          Generate one with:  openssl rand -hex 32\n` +
      `          It must be byte-identical on the gateway and every service that verifies it.`,
    );
    process.exit(1);
  }

  console.warn(
    `[${serviceName}] ${problem} — falling back to trusting x-user-id headers. ` +
    `This is insecure and is refused when NODE_ENV=production. Set it in your .env ` +
    `(npm run setup generates one).`,
  );
}
