/**
 * The password rules auth-service actually enforces.
 *
 * Mirrors `backend/shared/security/password.ts` — validatePasswordPolicy —
 * which every register, reset and change-password route runs before touching
 * the database, returning 422 with the failed rules when it does not pass.
 *
 * The app previously asked for "at least 8 characters" and nothing else, so a
 * password the form called valid was rejected by the server. This states the
 * real rules up front instead of letting the shopper discover them from a
 * failed submission.
 *
 * Kept as plain predicates so the register screen can show which rules are
 * still outstanding rather than one all-or-nothing message.
 */

export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

/** Same order and thresholds as the server's own checks. */
export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (p) => p.length >= MIN_PASSWORD_LENGTH,
  },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /[0-9]/.test(p) },
  {
    id: 'special',
    label: 'One special character',
    // The server's exact character class, not a looser "any non-alphanumeric":
    // a password passing a wider client rule would still fail server-side.
    test: (p) => /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(p),
  },
];

export interface PasswordPolicyResult {
  isValid: boolean;
  /** Rules not yet satisfied, in the order they are shown. */
  failed: PasswordRule[];
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const failed = PASSWORD_RULES.filter((rule) => !rule.test(password));
  return { isValid: failed.length === 0, failed };
}

/** One short line for a field error, when there is no room for the checklist. */
export function passwordPolicySummary(password: string): string | undefined {
  const { isValid, failed } = validatePasswordPolicy(password);
  if (isValid) return undefined;
  return `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}`;
}
