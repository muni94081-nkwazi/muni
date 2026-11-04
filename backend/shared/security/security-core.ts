import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';

// ─── 1. AES-256-GCM PII Encryption ──────────────────────────────────────────
//
// Re-exported from ./encryption.ts rather than reimplemented here. This file
// used to carry a byte-identical second copy, including its own
// PII_ENCRYPTION_KEY lookup and its own hardcoded fallback key — so hardening
// one left the other wide open, and which one a caller got depended only on
// which module it happened to import.
export { encryptPII, decryptPII, encryptNullable, decryptNullable } from './encryption.js';

// ─── 2. TOTP 2FA Service ──────────────────────────────────────────────────────

export interface TOTPSecretResult {
  secret: string;
  otpauthUrl: string;
}

export class TOTPService {
  static generateSecret(email: string, issuer = 'MUNI E-Commerce'): TOTPSecretResult {
    const buffer = crypto.randomBytes(20);
    const secret = this.base32Encode(buffer);
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
    return { secret, otpauthUrl };
  }

  static verifyToken(secret: string, token: string): boolean {
    if (!token || token.length !== 6 || !/^\d+$/.test(token)) return false;
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
    return (code % 1_000_000).toString().padStart(6, '0');
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

// ─── 3. Password Complexity Policy ───────────────────────────────────────────

export interface PasswordPolicyResult {
  isValid: boolean;
  errors: string[];
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (!password || password.length < 12) {
    errors.push('Password must be at least 12 characters in length');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }
  return { isValid: errors.length === 0, errors };
}

// ─── 4. Audit Logger ──────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: 'admin' | 'seller' | 'customer' | 'system';
  action: string;
  resource: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp: string;
  details?: Record<string, unknown> | null;
}

const auditLogsStore: AuditLogEntry[] = [];

export class AuditLogger {
  static logAction(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const log: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    auditLogsStore.push(log);
    console.log(`[AUDIT LOG] 🛡️ ${log.timestamp} | ${log.actorRole}:${log.actorId} | ${log.action} → ${log.resource}:${log.resourceId ?? 'N/A'}`);
    return log;
  }

  static getLogs(filter?: { actorId?: string; action?: string; resource?: string }): AuditLogEntry[] {
    let logs = [...auditLogsStore];
    if (filter?.actorId) logs = logs.filter((l) => l.actorId === filter.actorId);
    if (filter?.action) logs = logs.filter((l) => l.action === filter.action);
    if (filter?.resource) logs = logs.filter((l) => l.resource === filter.resource);
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}
