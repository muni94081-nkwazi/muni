// ─── Who must carry a second factor ───────────────────────────────────────────
//
// This lived as a private const in auth.service.ts, which meant the password
// login enforced it and the OAuth callback — a completely separate way into the
// same accounts — did not. A policy that only one of two front doors consults
// is not a policy, so it lives in its own module and both import it.
//
// These roles can move money, change prices, or read the customer base. A
// leaked password (or a linked Google account) alone must not be enough to
// reach any of them.

export const MFA_REQUIRED_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN', 'ROLE_SELLER'] as const;

/** True when this account's roles oblige it to hold a second factor. */
export function requiresSecondFactor(roles: readonly string[]): boolean {
  return roles.some((role) => (MFA_REQUIRED_ROLES as readonly string[]).includes(role));
}
