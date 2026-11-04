// ─── Identity for media-service ─────────────────────────────────────────
//
// This file used to implement `requireAuth`/`requireRole` by reading
// `x-user-id` and `x-user-roles` straight off the request — whatever the
// caller typed. It was sound only while two things both held: the gateway
// strips inbound identity headers, AND nothing else on the network can reach
// this service. The second has never been enforced.
//
// The shared middleware verifies the short-lived assertion the gateway signs,
// so forging identity needs the secret rather than knowledge of a header name.
// It keeps the header path as an explicit migration fallback when no secret is
// configured, so this swap changes nothing in a deployment without one and
// closes the hole in a deployment with one.
//
// Re-exported rather than reimplemented: the platform had nine copies of this
// decision, and a rule like "verify before trusting" is only as good as its
// least-updated copy. fulfillment-service and return-service moved first, in
// Stages 7 and 8; this is the rest of them.
export {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../../shared/http/service-auth.middleware.js';
