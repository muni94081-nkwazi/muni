// ─── OAuth handshake state ────────────────────────────────────────────────────
//
// Two short-lived records, both keyed by a value the server generated:
//
//   pending handshake  — created when the browser is sent to the provider,
//                        consumed when the provider sends it back. Carries the
//                        PKCE verifier and the return address.
//   exchange code      — created once a session has been authorised, consumed
//                        by POST /auth/exchange. Carries the tokens.
//
// Why both exist rather than passing the values through the URL:
//
//   `state` is reflected back by the provider verbatim, so anything encoded in
//   it is attacker-controllable. Keeping the return address server-side means a
//   crafted `state` cannot steer where the tokens go, and a nonce the server
//   minted and can only redeem once means a callback that no browser here
//   started is rejected rather than completed (login CSRF).
//
//   The tokens themselves used to ride in the redirect's query string, which
//   put live credentials in browser history, in the Referer of anything the
//   callback page loaded, and in every access log between here and the client.
//   A 60-second single-use code costs one POST and leaks none of that.

import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { consumeValue, writeValue } from './redis-store.js';

const HANDSHAKE_TTL_SEC = 10 * 60;  // a consent screen the user may read slowly
const EXCHANGE_TTL_SEC  = 60;       // one immediate POST from the callback page

// ─── Pending handshake ────────────────────────────────────────────────────────

export interface PendingHandshake {
  provider: 'google' | 'facebook' | 'apple';
  /** PKCE verifier; replayed at the token endpoint to prove same-client. */
  codeVerifier: string;
  /**
   * Where to send the finished login. Held here rather than in `state` — this
   * is the value an open redirect would have to control, so it must never make
   * a round trip through the provider.
   */
  returnTo: string | null;
  /**
   * True when the flow began in a browser that will carry our cookie back.
   * Native app flows open the system browser and have no cookie jar shared
   * with this service, so the cookie check is skipped for them and the
   * single-use nonce is what stands.
   */
  browserBound: boolean;
}

/** Opaque, unguessable, and the only thing that travels in `state`. */
function newNonce(): string {
  return randomBytes(32).toString('base64url');
}

/** RFC 7636 S256: verifier is the secret, challenge is what the provider sees. */
export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Record a handshake we are about to start and return the nonce that names it.
 * The nonce goes in `state`; everything else stays here.
 */
export async function startHandshake(pending: PendingHandshake): Promise<string> {
  const nonce = newNonce();
  await writeValue(`oauth:state:${nonce}`, JSON.stringify(pending), HANDSHAKE_TTL_SEC);
  return nonce;
}

/**
 * Redeem a nonce. Returns null when it never existed, has expired, or has
 * already been used — all of which mean this callback does not correspond to a
 * handshake this service started, and must not be completed.
 *
 * Single-use by construction: the read deletes the record, so a replayed
 * callback finds nothing.
 */
export async function consumeHandshake(nonce: string | undefined): Promise<PendingHandshake | null> {
  if (!nonce) return null;

  const raw = await consumeValue(`oauth:state:${nonce}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingHandshake;
  } catch {
    // Written by this module, so this should not happen — but a corrupt record
    // is not a handshake we can trust either.
    return null;
  }
}

// ─── Exchange code ────────────────────────────────────────────────────────────

export interface ExchangePayload {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** Park an authorised session behind a one-time code. */
export async function createExchangeCode(payload: ExchangePayload): Promise<string> {
  const code = randomUUID();
  await writeValue(`oauth:exchange:${code}`, JSON.stringify(payload), EXCHANGE_TTL_SEC);
  return code;
}

/**
 * Redeem an exchange code for the session behind it. Returns null when the code
 * is unknown, expired, or already spent — a code is good for exactly one POST.
 */
export async function consumeExchangeCode(code: string | undefined): Promise<ExchangePayload | null> {
  if (!code) return null;

  const raw = await consumeValue(`oauth:exchange:${code}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ExchangePayload;
  } catch {
    return null;
  }
}

export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_HANDSHAKE_TTL_SEC = HANDSHAKE_TTL_SEC;
