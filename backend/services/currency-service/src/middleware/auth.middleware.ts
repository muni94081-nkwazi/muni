// ─── Identity for currency-service ────────────────────────────────────────────
//
// This file used to implement its own `requireAuth`/`requireRole` by reading
// `x-user-id` and `x-user-roles` straight off the request — headers that are
// whatever the caller typed. Nothing imported it, so it was a header-trusting
// implementation sitting in the tree waiting to be picked up by the next route
// added here.
//
// Re-exported from the shared middleware rather than reimplemented, the same
// way fulfillment-service does it: with INTERNAL_IDENTITY_SECRET set it
// verifies the gateway's signed assertion, so forging identity needs the secret
// rather than knowledge of a header name.
//
// What this service actually uses is `optionalAuth`. Exchange rates are public
// — the gateway mounts /currencies with pub() because a signed-out shopper sees
// converted prices — and these endpoints read no per-user data, so requiring a
// session would break the storefront without protecting anything. What changes
// is that a session, when there is one, is resolved from the verified assertion
// instead of a header.
export {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../../shared/http/service-auth.middleware.js';
