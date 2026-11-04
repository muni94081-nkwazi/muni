// ─── Identity for cart-service ────────────────────────────────────────────────
//
// This file used to implement its own `requireAuth`/`requireRole` by reading
// `x-user-id` and `x-user-roles` straight off the request — headers that are
// whatever the caller typed. Nothing imported it, and the controller read the
// raw header itself, so identity on this service was a claim rather than a
// fact.
//
// Re-exported from the shared middleware rather than reimplemented, the same
// way fulfillment-service does it: with INTERNAL_IDENTITY_SECRET set it
// verifies the gateway's signed assertion, so forging identity needs the secret
// rather than knowledge of a header name. Keeping the module path means a
// future import lands on the verified implementation instead of this one.
//
// `optionalAuth` is the one this service leans on: /cart is public by design so
// a guest can fill a basket before signing in (see the gateway's customer
// routes), and it resolves a session when there is one without rejecting when
// there is not.
export {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../../shared/http/service-auth.middleware.js';
