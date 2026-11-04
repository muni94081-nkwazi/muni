import crypto from 'node:crypto';
import { isPlaceholderSecret, placeholderSecretMessage } from './placeholder-secrets.js';

// ─── PII Encryption ───────────────────────────────────────────────────────────
//
// AES-256-GCM for values that must come back out again — OAuth provider tokens,
// TOTP secrets. GCM rather than CBC because it authenticates as well as
// encrypts: a tampered ciphertext fails to decrypt instead of quietly yielding
// garbage that downstream code then treats as a real token.
//
// This protects data at rest. It is not a substitute for not storing the value
// at all: anything that can call decryptPII() can read every row.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96 bits — the size GCM is specified for
const AUTH_TAG_LENGTH = 16;
const KEY_BYTES = 32;  // AES-256

// A key that ships in the repository is not a key. Anyone reading this file can
// decrypt any database dump encrypted with it, so treating it as a silent
// production fallback would turn "encrypted at rest" into a label with nothing
// behind it. Same rule the JWT secrets follow in ../utils/token.ts:
//   production   → fatal at startup.
//   development  → this well-known key, with a warning. Unlike a token secret
//                  it cannot be randomised per process: rows encrypted before a
//                  restart have to stay readable after it.
const DEV_FALLBACK_KEY_HEX = '0123456789abcdef'.repeat(4);

function resolveKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;

  if (hex) {
    // The development fallback below is a valid 32-byte hex string, so someone
    // copying it into PII_ENCRYPTION_KEY passes every structural check while
    // encrypting with a key that is printed in this file.
    if (process.env.NODE_ENV === 'production' && isPlaceholderSecret(hex)) {
      throw new Error(`[security] ${placeholderSecretMessage('PII_ENCRYPTION_KEY')}`);
    }

    const key = Buffer.from(hex, 'hex');
    // Buffer.from silently truncates at the first non-hex character, so a
    // typo'd or quoted value would otherwise become a short — and therefore
    // weak — key without anything failing.
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `[security] PII_ENCRYPTION_KEY decoded to ${key.length} bytes, expected ${KEY_BYTES}. ` +
        `It must be exactly ${KEY_BYTES} bytes hex-encoded (${KEY_BYTES * 2} hex characters). ` +
        `Generate one with: openssl rand -hex ${KEY_BYTES}`,
      );
    }
    return key;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[security] PII_ENCRYPTION_KEY is not set. Refusing to start: OAuth tokens ' +
      'and TOTP secrets would be encrypted with a key committed to this repository, ' +
      `which is equivalent to storing them in plaintext. Generate one with: openssl rand -hex ${KEY_BYTES}`,
    );
  }

  console.warn(
    '[security] PII_ENCRYPTION_KEY is not set — falling back to the well-known ' +
    'development key. Encrypted columns are readable by anyone with this repo. ' +
    'Set PII_ENCRYPTION_KEY in your .env (npm run setup generates one).',
  );
  return Buffer.from(DEV_FALLBACK_KEY_HEX, 'hex');
}

// Resolved once, lazily: throwing at import time would take down the process
// before its logger is up, turning a clear message into an unattributed stack.
let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (!cachedKey) cachedKey = resolveKey();
  return cachedKey;
}

/**
 * Encrypt a value for storage.
 *
 * Output format: `iv:authTag:cipherText`, all hex. The IV is random per call,
 * so encrypting the same input twice gives different ciphertext — which is the
 * point, but it also means an encrypted column cannot be used in a WHERE
 * clause or a unique index. Look rows up by something else.
 *
 * Empty/undefined input passes through untouched so optional columns stay null
 * rather than becoming a ciphertext of the empty string.
 */
export function encryptPII(plainText: string): string {
  if (!plainText) return plainText;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey(), iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a value produced by encryptPII.
 *
 * A value that is not in `iv:authTag:cipherText` form is returned as-is. That
 * is deliberate: rows written before encryption was switched on are still
 * plaintext, and this lets them keep working instead of throwing on every read
 * until a backfill runs. It does mean a corrupted value can slip through
 * unnoticed — an authentication failure on a well-formed value still throws,
 * which is the case that matters.
 */
export function decryptPII(cipherString: string): string {
  if (!cipherString || !cipherString.includes(':')) return cipherString;

  const parts = cipherString.split(':');
  if (parts.length !== 3) return cipherString;

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/** Nullable convenience wrappers — OAuth refresh tokens are optional columns. */
export const encryptNullable = (v: string | null | undefined): string | null =>
  v ? encryptPII(v) : null;

export const decryptNullable = (v: string | null | undefined): string | null =>
  v ? decryptPII(v) : null;
