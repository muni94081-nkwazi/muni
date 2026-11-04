import crypto from 'node:crypto';

// ─── TOTP ─────────────────────────────────────────────────────────────────────
//
// auth-service puts ROLE_ADMIN, ROLE_SUPER_ADMIN and ROLE_SELLER behind MFA
// (MFA_REQUIRED_ROLES in auth-service/src/services/auth.service.ts), so this
// flow cannot log in as a seller or an admin with a password alone. The test
// enrols an authenticator and generates codes the way a phone would.
//
// Implemented here rather than pulled from otplib/speakeasy because neither is
// in the monorepo and this suite is not allowed to add dependencies. The
// parameters mirror shared/security/security-core.ts exactly: RFC 6238,
// HMAC-SHA1, 6 digits, 30-second step, RFC 4648 base32 secret.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character in TOTP secret: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/** The 6-digit code an authenticator app would show right now. */
export function totpCode(secret: string, atMs: number = Date.now()): string {
  const timeStep = Math.floor(atMs / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 1_000_000).toString().padStart(6, '0');
}
