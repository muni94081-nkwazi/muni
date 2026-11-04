// ─── Identity for fulfillment-service ─────────────────────────────────────────
//
// This file used to implement its own `requireAuth`/`requireRole` by reading
// `x-user-id` and `x-user-roles` straight off the request. Those headers are
// whatever the caller typed. Every other service on the money path — order,
// inventory, payment, checkout — moved to the shared middleware, which verifies
// a signed identity assertion the gateway stamps and a forged header cannot
// reproduce. This one did not, so it was the single place on the platform where
// claiming `x-user-roles: ROLE_ADMIN` still worked.
//
// Verified live before this change: order-service answered 401 to a forged
// admin header while fulfillment-service accepted the same header and let a
// caller claiming ROLE_SELLER mark a DIFFERENT seller's parcel DELIVERED — the
// state that makes that seller's escrow payable. The COD cash endpoints in
// cod.routes.ts were gated the same way, so ROLE_RIDER was equally free to
// claim, and those record cash actually handed over on a doorstep.
//
// Re-exported rather than reimplemented so there is one definition of identity
// on the platform, not two that can drift.
export {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../../shared/http/service-auth.middleware.js';
