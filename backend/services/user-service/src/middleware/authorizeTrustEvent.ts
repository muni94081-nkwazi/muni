import type { NextFunction, Request, Response } from 'express';
import ApiError from '../utils/ApiError.js';
import authenticate from './authenticate.js';
import {
  INTERNAL_IDENTITY_HEADER,
  verifyIdentity,
} from '../../../../shared/utils/internal-identity.js';

// ─── Who may write a seller trust event ───────────────────────────────────────
//
// `POST /sellers/:sellerId/trust-events` had no authentication of any kind. It
// is mounted publicly at the gateway — `pub('/sellers', targets.user)`, which
// proxies every method, not the `pubReadOnly` helper that would 405 a write —
// so any unauthenticated request from the internet could post events against
// any seller id. Those events are the input to the trust score and to standing:
// a few forged SLA_BREACHED or DISPUTE_OPENED events could push a competitor
// toward AT_RISK, and forged favourable ones could pull a seller's own score up.
//
// Two kinds of caller are legitimate, and they authenticate differently.
export function authorizeTrustEvent(req: Request, res: Response, next: NextFunction): void {
  // ── 1. A peer service ───────────────────────────────────────────────────
  //
  // dispute-service and buyer-protection-service report lifecycle events here
  // as they happen; there is no end user behind the call. They present a signed
  // assertion, and the `svc` claim is what makes it safe to accept: the gateway
  // signs on behalf of ordinary logged-in customers too, so the signature alone
  // would let any shopper write trust events. Only a service sets `svc`.
  const header = req.headers[INTERNAL_IDENTITY_HEADER];
  const token  = Array.isArray(header) ? header[0] : header;
  const identity = verifyIdentity(token);

  if (identity?.svc) {
    res.locals.trustEventActor = { type: 'service', name: identity.svc };
    next();
    return;
  }

  // ── 2. A signed-in seller or an admin ───────────────────────────────────
  //
  // Same pattern as the other guarded routes in this file's router: verify the
  // Bearer token first, then decide. `authenticate` calls next(err) with a 401
  // ApiError when the token is missing, malformed or expired, which is exactly
  // the rejection an unauthenticated caller should get.
  authenticate(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }

    const viewer = req.user;

    // Admins already manage sellers through this router — /verify and
    // /standing are both requireRole('ADMIN') — so the same role applies here.
    if (viewer?.role === 'ADMIN') {
      res.locals.trustEventActor = { type: 'admin', name: viewer.id };
      next();
      return;
    }

    // A seller may write only against their own id. Note this permits a seller
    // to record events about themselves, which is worth reviewing separately:
    // the events feed their own trust score, so self-reporting is a
    // self-dealing surface even when the id matches.
    if (viewer?.id === req.params.sellerId) {
      res.locals.trustEventActor = { type: 'seller', name: viewer.id };
      next();
      return;
    }

    next(ApiError.forbidden('You can only record trust events for your own seller account'));
  });
}

export default authorizeTrustEvent;
