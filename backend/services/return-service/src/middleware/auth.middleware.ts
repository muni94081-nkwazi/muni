// ─── Identity for return-service ──────────────────────────────────────────────
//
// This file used to implement `requireAuth`/`requireRole` by reading
// `x-user-id` and `x-user-roles` straight off the request — whatever the caller
// typed. Verified live in Stage 8: a request carrying
// `x-user-roles: ROLE_ADMIN` reached this service's handlers, while
// order-service and inventory-service answered 401 to the identical header.
//
// That matters here because `/admin/returns/:id/status` approves and rejects
// returns, and an approval publishes `refund.initiated`. A forgeable admin role
// in front of that is a forgeable refund.
//
// Stage 7 fixed the same pattern in fulfillment-service and described it as the
// last holdout. It was not: seven services still wire a local copy of this
// middleware. This is the second of them; the rest are recorded in the Stage 8
// report with the same one-line remedy.
//
// The shared middleware keeps the header path as an explicit migration fallback
// when no signing secret is configured, so this swap changes nothing in a
// deployment without one and closes the hole in a deployment with one.
export {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../../shared/http/service-auth.middleware.js';
