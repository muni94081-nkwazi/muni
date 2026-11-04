import { Router } from 'express';
import { proxy }       from '../utils/proxy.js';
import { requireRole } from '../middleware/auth.middleware.js';

// ─── Rider Routes (/api/v1/rider/*) ──────────────────────────────────────────
//
// The gateway had three surfaces — customer, seller and admin — and no rider
// one. fulfillment-service has always served a full delivery-rider API behind
// `requireRole('ROLE_RIDER')`: claim a package, move it through the delivery
// states, capture a signature at the door, list active deliveries. None of it
// was reachable from outside the cluster, so a rider's phone had no way in.
//
// That matters more after the Stage 8 decision (see "Decision: who owns the
// fulfillment lifecycle" in docs/Architecture_Diagram.md): rider operations and
// cash-on-delivery are precisely what fulfillment-service was left owning, and
// a domain nothing can call is not a domain.
//
// The paths below are the ones fulfillment-service already declares — the proxy
// forwards `req.originalUrl` verbatim, so `/api/v1/rider/packages/:id/status`
// arrives as exactly that. No path rewriting, and no new service endpoints.

export function riderRoutes(targets: Record<string, string>): Router {
  const router = Router();

  // Every route here is a rider acting on a package. ROLE_OPS and the admin
  // roles are included because dispatch staff work these same queues when a
  // rider's phone dies mid-round; fulfillment-service still checks that the
  // package is assigned to the rider named in the verified identity, so the
  // role alone opens nothing.
  router.use(requireRole('ROLE_RIDER', 'ROLE_OPS', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN'));

  const route = (prefix: string, target: string) =>
    router.use(prefix, (req, res, next) => proxy(req, res, target).catch(next));

  route('/profile',    targets.fulfillment);  // register/update the rider's own profile
  route('/packages',   targets.fulfillment);  // claim, advance, sign for a package
  route('/deliveries', targets.fulfillment);  // the rider's active round

  return router;
}
