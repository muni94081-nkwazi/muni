// ─── Identity for tax-service ─────────────────────────────────────────────────
//
// This file used to implement its own `requireAuth`/`requireRole` by reading
// `x-user-id` and `x-user-roles` straight off the request — headers that are
// whatever the caller typed. Nothing imported it, so every route in
// routes/index.ts ran with no identity at all and `invoice.list` believed a
// `?buyerId=` / `?sellerId=` query parameter as proof of who was asking. A tax
// invoice carries both parties' names, addresses and TINs.
//
// Re-exported from the shared middleware rather than reimplemented, the same
// way fulfillment-service does it: with INTERNAL_IDENTITY_SECRET set it
// verifies the gateway's signed assertion, so forging identity needs the secret
// rather than knowledge of a header name. Keeping the module path means a
// future import lands on the verified implementation instead of this one.
export {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../../shared/http/service-auth.middleware.js';
