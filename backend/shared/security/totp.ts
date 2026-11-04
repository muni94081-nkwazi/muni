import crypto from 'node:crypto';

export interface TOTPSecretResult {
  secret: string; // Base32 encoded secret
  otpauthUrl: string; // otpauth://totp/MUNI:user@muni.ug?secret=...
}

/**
 * TOTP 2FA Engine (RFC 6238 compliant)
 */
export class TOTPService {
  /** Generate Base32 TOTP secret */
  static generateSecret(email: string, issuer = 'MUNI E-Commerce'): TOTPSecretResult {
    const buffer = crypto.randomBytes(20);
    const secret = this.base32Encode(buffer);
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
    return { secret, otpauthUrl };
  }

  /** Verify 6-digit TOTP token against secret */
  static verifyToken(secret: string, token: string): boolean {
    if (!token || token.length !== 6 || !/^\d+$/.test(token)) return false;

    // Check token for current time window, previous window (-1), and next window (+1) to allow for clock drift
    const currentWindow = Math.floor(Date.now() / 1000 / 30);
    for (let errorWindow = -1; errorWindow <= 1; errorWindow++) {
      const generatedToken = this.generateTOTPToken(secret, currentWindow + errorWindow);
      if (generatedToken === token) {
        return true;
      }
    }
    return false;
  }

  private static generateTOTPToken(secret: string, timeStep: number): string {
    const key = this.base32Decode(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(timeStep));

    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;

    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (code % 1_000_000).toString().padStart(6, '0');
    return otp;
  }

  private static base32Encode(buffer: Buffer): string {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        output += ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private static base32Decode(input: string): Buffer {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanInput = input.toUpperCase().replace(/=/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < cleanInput.length; i++) {
      const idx = ALPHABET.indexOf(cleanInput[i]);
      if (idx === -1) continue;

      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }
}
