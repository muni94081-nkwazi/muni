// ─── Identity for dispute-service ─────────────────────────────────────────────
//
// This file used to implement its own `requireAuth`/`requireRole` by reading
// `x-user-id` and `x-user-roles` straight off the request — headers that are
// whatever the caller typed. Nothing imported it: routes/index.ts guards every
// dispute route with the shared middleware instead (see the note there), which
// is why this service's authorization holds today.
//
// It is re-exported rather than left as a second, weaker implementation. A
// header-trusting `requireAuth` sitting at the obvious import path is a trap
// for the next route added here — the whole class of bug this migration exists
// to close — and routes/index.ts already proves the shared one is what this
// service wants.
export {
  requireAuth,
  requireRole,
  requireInternalCaller,
  optionalAuth,
  assertInternalIdentityConfigured,
} from '../../../../shared/http/service-auth.middleware.js';
