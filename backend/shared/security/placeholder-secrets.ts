// ─── Placeholder Secret Detection ─────────────────────────────────────────────
//
// Every secret in this repo is length-checked before use, and for a while that
// was the only check. It is not enough: `.env.example` and the compose fallbacks
// ship values that are deliberately long enough to keep a fresh clone booting —
// `dev-internal-identity-secret-change-me-32chars` is 46 characters and sails
// past a `length >= 32` test.
//
// The failure mode that creates is the quiet one. A production deploy with no
// .env starts cleanly, reports healthy, and signs its internal identity
// assertions with a value anybody who has cloned this repository can read. The
// length check that was supposed to prevent exactly that says nothing, because
// the placeholder is long.
//
// So a known-public value is treated as no value at all: usable in development
// where the point is to boot without ceremony, fatal in production where the
// point is that the secret is secret.

/**
 * Values shipped in this repository as bootable defaults. Anything here is
 * public by definition — it is in git.
 */
const KNOWN_PLACEHOLDERS = new Set([
  // docker-compose.yml x-common-env and .env.example
  'dev-internal-identity-secret-change-me-32chars',
  // docker-compose.yml auth-service / user-service, and .env.example
  'dev-access-secret-change-me',
  'dev-refresh-secret-change-me',
  // shared/security/encryption.ts development fallback key
  '0123456789abcdef'.repeat(4),
]);

/**
 * Substrings that mark a value as a template rather than a secret. Catches
 * variants that were edited but not actually replaced — `my-app-change-me`,
 * `CHANGE_ME_IN_PROD` — which the exact list above would miss.
 *
 * Matched case-insensitively. Kept narrow on purpose: a real generated secret
 * is hex or base64, so it cannot contain any of these by accident.
 */
const PLACEHOLDER_MARKERS = ['change-me', 'changeme', 'change_me', 'replace-me', 'your-secret'];

/**
 * True when `value` is one of this repo's shipped defaults rather than a real
 * secret. Empty/undefined is NOT a placeholder — that is "unset", a separate
 * condition the callers report differently.
 */
export function isPlaceholderSecret(value: string | undefined | null): boolean {
  if (!value) return false;
  if (KNOWN_PLACEHOLDERS.has(value)) return true;

  const lowered = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * Shared wording so the gateway, the money-path services and the encryption
 * layer all explain the same failure the same way.
 */
export function placeholderSecretMessage(name: string): string {
  return (
    `${name} is set to a placeholder value shipped in this repository. ` +
    `It is long enough to pass the length check but it is public — every clone ` +
    `of this repo has it, so it provides no security at all. ` +
    `Generate a real one with:  openssl rand -hex 32`
  );
}
