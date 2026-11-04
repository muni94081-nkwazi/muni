import { UGANDAN_PHONE_REGEX } from './constants';

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidUgandanPhone(value: string): boolean {
  return UGANDAN_PHONE_REGEX.test(value.trim());
}

// ─── Password policy ──────────────────────────────────────────────────────────
//
// These rules mirror backend/shared/security/password.ts — validatePasswordPolicy
// — which every register, reset and change-password route runs before touching
// the database, answering 422 with the failed rules when it does not pass.
//
// They previously did not. This file asked for 8 characters plus upper, lower
// and a digit, and carried a comment claiming that "matches user-service's
// RegisterRequest validation exactly, so a password that passes here won't get
// rejected server-side". The server asks for 12 characters AND a special
// character, so `Passw0rdAB` sailed through the form and came back 422 — with
// the per-rule `issues` array discarded, leaving the shopper told they had
// failed a policy nobody had shown them.
//
// Mobile has had the correct rules all along (mobile/src/utils/passwordPolicy.ts);
// this brings web into line. Keep all three in step.

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

/** Which rules a candidate password has not met yet, in display order. */
export function failedPasswordRules(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

/** One short line for a field error, when there is no room for the checklist. */
export function passwordStrengthMessage(value: string): string | null {
  const failed = failedPasswordRules(value);
  if (failed.length === 0) return null;
  return `Password needs: ${failed.map((rule) => rule.label.toLowerCase()).join(', ')}`;
}

export function isRequired(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim().length > 0;
}

export function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Normalizes a Ugandan phone number to the 07XXXXXXXX form used for display. */
export function normalizeDisplayPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('256')) return '0' + digits.slice(3);
  if (digits.startsWith('0')) return digits;
  return value;
}
