// ─── Attempt Stores ───────────────────────────────────────────────────────────
//
// A TOTP code is six digits — one million combinations, and the verification
// window accepts three 30-second steps. A password-reset OTP is the same six
// digits with a fifteen-minute window. Without a throttle an attacker walks
// either space, so brute-force protection is not optional for either.
//
// Three guarantees:
//   • countFailedAttempt()      — caps failed TOTP verifications per user.
//   • countFailedResetAttempt() — the same for password-reset OTPs.
//   • burnCode()                — a code that succeeded once cannot be replayed
//                                 inside its remaining validity window
//                                 (shoulder-surfing, or a code captured in
//                                 transit against a downgraded client).
//
// The Redis connection and its in-process fallback live in ./redis-store.js,
// which this shares with the OAuth handshake store. The fallback caveat is
// unchanged: with N replicas the effective ceiling becomes N × MAX_ATTEMPTS,
// so Redis is required in production.

import {
  claimKey,
  deleteKey,
  incrementWithExpiry,
  readValue,
} from './redis-store.js';

const MAX_ATTEMPTS       = 5;
const ATTEMPT_WINDOW_SEC = 15 * 60;
const CODE_BURN_SEC      = 90;   // outlives the ±1 step verification window

// Password-reset OTPs need the same throttle for the same reason. The ceiling
// is a little looser than TOTP's because a shopper is copying a code out of an
// email rather than reading it off a screen, so a typo or two is ordinary; and
// the window matches the OTP's own lifetime, so a lockout cannot outlive the
// code it protects.
const RESET_MAX_ATTEMPTS       = 10;
const RESET_ATTEMPT_WINDOW_SEC = 15 * 60;

// ─── Generic counter ──────────────────────────────────────────────────────────
//
// The MFA and password-reset throttles differ only in key prefix, ceiling and
// window, so the mechanics live here once. Callers use the named wrappers.

async function countFailed(
  key: string,
  max: number,
  windowSec: number,
): Promise<{ locked: boolean; attempts: number }> {
  const attempts = await incrementWithExpiry(key, windowSec);
  return { locked: attempts > max, attempts };
}

async function isLocked(key: string, max: number): Promise<boolean> {
  const raw = await readValue(key);
  return raw !== null && Number(raw) > max;
}

// ─── MFA (TOTP) ───────────────────────────────────────────────────────────────

/**
 * Record a failed attempt and report whether the user is now locked out.
 * Counts up so the caller can surface "n attempts remaining".
 */
export async function countFailedAttempt(userId: string): Promise<{ locked: boolean; attempts: number }> {
  return countFailed(`mfa:attempts:${userId}`, MAX_ATTEMPTS, ATTEMPT_WINDOW_SEC);
}

/** True when the user has already exceeded the attempt ceiling. */
export async function isLockedOut(userId: string): Promise<boolean> {
  return isLocked(`mfa:attempts:${userId}`, MAX_ATTEMPTS);
}

/** Clear the counter after a successful verification. */
export async function clearAttempts(userId: string): Promise<void> {
  return deleteKey(`mfa:attempts:${userId}`);
}

/**
 * Claim a code as used. Returns false when it was already burned, which the
 * caller must treat as a failed verification.
 */
export async function burnCode(userId: string, code: string): Promise<boolean> {
  return claimKey(`mfa:used:${userId}:${code}`, '1', CODE_BURN_SEC);
}

// ─── Password-reset OTP ───────────────────────────────────────────────────────
//
// Keyed on the user id, not the caller's IP: the gateway already bounds one
// source, and the case that limit cannot reach is the same six digits being
// guessed against one account from many addresses.

export async function countFailedResetAttempt(
  userId: string,
): Promise<{ locked: boolean; attempts: number }> {
  return countFailed(`pwreset:attempts:${userId}`, RESET_MAX_ATTEMPTS, RESET_ATTEMPT_WINDOW_SEC);
}

export async function isResetLockedOut(userId: string): Promise<boolean> {
  return isLocked(`pwreset:attempts:${userId}`, RESET_MAX_ATTEMPTS);
}

export async function clearResetAttempts(userId: string): Promise<void> {
  return deleteKey(`pwreset:attempts:${userId}`);
}

export const MFA_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const PASSWORD_RESET_MAX_ATTEMPTS = RESET_MAX_ATTEMPTS;

// ─── Lifecycle ────────────────────────────────────────────────────────────────
// Re-exported under their historical names so app.ts keeps working; both now
// operate on the single shared connection.
export { connectRedisStore as connectMfaStore, disconnectRedisStore as disconnectMfaStore } from './redis-store.js';
