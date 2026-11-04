import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'node:crypto';

// ─── Utility Helpers ──────────────────────────────────────────────────────────
export const generateId = () => randomUUID();
export function generateRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

// ─── JWT Configuration ────────────────────────────────────────────────────────
//
// There is deliberately no hardcoded secret fallback. A committed default like
// 'muni-dev-access-secret-change-me' means one missing environment variable in
// one environment silently downgrades the whole platform to tokens anybody
// reading this repository can forge — and nothing surfaces the mistake.
//
// Instead:
//   • production   → a missing or short secret is fatal at startup.
//   • development  → a random per-process secret, with a loud warning. Tokens
//                    stop working across restarts, which is annoying on purpose:
//                    it pushes you to set the variable rather than forget it.

const MIN_SECRET_LENGTH = 32;

function resolveSecret(name: string): string {
  const value = process.env[name];

  if (value && value.length >= MIN_SECRET_LENGTH) return value;

  const problem = !value
    ? `${name} is not set`
    : `${name} is only ${value.length} characters (minimum ${MIN_SECRET_LENGTH})`;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[security] ${problem}. Refusing to start: tokens signed with a weak or ` +
      `absent secret can be forged. Set ${name} to a random value of at least ` +
      `${MIN_SECRET_LENGTH} characters.`,
    );
  }

  console.warn(
    `[security] ${problem}. Using a random per-process secret — tokens will not ` +
    `survive a restart and will not be accepted by other services. Set ${name} ` +
    `in your .env to fix this.`,
  );
  return randomBytes(48).toString('hex');
}

const ACCESS_SECRET  = resolveSecret('JWT_ACCESS_SECRET');
const REFRESH_SECRET = resolveSecret('JWT_REFRESH_SECRET');

// 15 minutes, not an hour: an access token cannot be revoked by anything other
// than expiry unless the denylist below is consulted, so the window in which a
// stolen or stale token still works should be short.
const ACCESS_EXPIRES  = (process.env.JWT_ACCESS_EXPIRES_IN  ?? '15m') as jwt.SignOptions['expiresIn'];
const REFRESH_EXPIRES = (process.env.JWT_REFRESH_EXPIRES_IN ?? '30d') as jwt.SignOptions['expiresIn'];

/**
 * ACCESS_EXPIRES in seconds, for the `expiresIn` field auth responses report.
 *
 * Both login paths used to hardcode `expiresIn: 3600` while the token itself
 * lived 15 minutes. A client that schedules a proactive refresh on that number
 * — which is the only reason to send it — lets the token expire 45 minutes
 * early and then discovers it from a 401. Deriving it from the same value the
 * signer uses is the only way the two cannot drift.
 */
function expiresInSeconds(value: jwt.SignOptions['expiresIn']): number {
  if (typeof value === 'number') return value;

  const match = /^(\d+)\s*([smhd])?$/.exec(String(value ?? '').trim());
  if (!match) return 900; // unparseable — fall back to the 15m default

  const amount = Number(match[1]);
  switch (match[2]) {
    case 'd': return amount * 86_400;
    case 'h': return amount * 3_600;
    case 'm': return amount * 60;
    default:  return amount;   // bare number, or an explicit 's'
  }
}

export const ACCESS_TOKEN_TTL_SECONDS = expiresInSeconds(ACCESS_EXPIRES);

const ISSUER   = 'muni-auth';
const AUDIENCE = 'muni-api';

// ─── Payload Types ────────────────────────────────────────────────────────────
export interface AccessTokenPayload {
  sub:     string;      // raw JWT subject (user id)
  userId?: string;      // convenience alias for sub, populated by readAccessToken
  roles:   string[];
  type:    'access';
  jti?:    string;      // unique token id — the handle revocation needs
  exp?:    number;      // seconds since epoch, set by jsonwebtoken
}

export interface RefreshTokenPayload {
  sub:    string;   // user id
  family: string;   // random family ID for reuse detection
  type:   'refresh';
}

// ─── Issuers ──────────────────────────────────────────────────────────────────
export function createAccessToken(userId: string, roles: string[]): string {
  const payload: AccessTokenPayload = { sub: userId, roles, type: 'access', jti: randomUUID() };
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
    issuer:    ISSUER,
    audience:  AUDIENCE,
  });
}

export function createRefreshToken(userId: string, family: string): string {
  const payload: RefreshTokenPayload = { sub: userId, family, type: 'refresh' };
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
    issuer:    ISSUER,
    audience:  AUDIENCE,
  });
}

// ─── Readers ──────────────────────────────────────────────────────────────────
export function readAccessToken(token?: string): AccessTokenPayload | null {
  if (!token) return null;
  try {
    // `issuer`/`audience` are verified rather than merely present, so a token
    // minted for a different MUNI surface cannot be replayed against the API.
    const payload = jwt.verify(token, ACCESS_SECRET, {
      issuer:   ISSUER,
      audience: AUDIENCE,
    }) as AccessTokenPayload;

    if (payload.type !== 'access') return null;
    // Expose as `userId` for backward-compat with existing gateway code
    return { ...payload, userId: payload.sub };
  } catch {
    return null;
  }
}

export function readRefreshToken(token?: string): RefreshTokenPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, REFRESH_SECRET, {
      issuer:   ISSUER,
      audience: AUDIENCE,
    }) as RefreshTokenPayload;

    if (payload.type !== 'refresh') return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Short-lived MFA challenge tokens ─────────────────────────────────────────
//
// Issued after a correct password but before the second factor. Deliberately
// NOT an access token: it carries no roles, so it grants nothing on its own,
// and it names its own purpose so an enrolment challenge cannot be replayed
// against the verification endpoint.

export type MfaPurpose = 'verify' | 'enrol';

interface MfaChallengePayload {
  sub:     string;
  purpose: MfaPurpose;
  type:    'mfa_challenge';
}

const MFA_CHALLENGE_EXPIRES = '5m';

export function createMfaChallengeToken(userId: string, purpose: MfaPurpose): string {
  const payload: MfaChallengePayload = { sub: userId, purpose, type: 'mfa_challenge' };
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: MFA_CHALLENGE_EXPIRES,
    issuer:    ISSUER,
    audience:  AUDIENCE,
  });
}

export function readMfaChallengeToken(
  token?: string,
  expectedPurpose?: MfaPurpose,
): { sub: string; purpose: MfaPurpose } | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, ACCESS_SECRET, {
      issuer:   ISSUER,
      audience: AUDIENCE,
    }) as MfaChallengePayload;

    if (payload.type !== 'mfa_challenge') return null;
    if (expectedPurpose && payload.purpose !== expectedPurpose) return null;
    return { sub: payload.sub, purpose: payload.purpose };
  } catch {
    return null;
  }
}
