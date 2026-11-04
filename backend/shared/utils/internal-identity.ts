import jwt from 'jsonwebtoken';

// ─── Signed Internal Identity ─────────────────────────────────────────────────
//
// Defence in depth behind `stripClientIdentity`.
//
// The gateway is the only component that verifies a user's access token. It
// then needs to tell downstream services *who* the caller is. Passing that as
// plain `x-user-id` / `x-user-roles` headers works only while two assumptions
// hold simultaneously:
//
//   ① the gateway strips those headers off inbound requests, and
//   ② no traffic can reach a service except through the gateway.
//
// If either assumption breaks — a misordered middleware, a NetworkPolicy typo,
// a debug port left open — the whole authorization model collapses silently.
// So the gateway *also* signs a short-lived assertion that a service can
// verify cryptographically. Forging it requires the shared secret, not just
// knowledge of a header name.
//
// The assertion is deliberately short-lived (30s): it covers one in-flight
// request, so a captured header is worthless almost immediately, and there is
// nothing to revoke.

const TTL_SECONDS = 30;
const ISSUER      = 'muni-api-gateway';
const AUDIENCE    = 'muni-internal';

export const INTERNAL_IDENTITY_HEADER = 'x-internal-identity';

export interface InternalIdentity {
  sub:   string;
  roles: string[];
  /**
   * Name of the *service* that minted this assertion, when one did.
   *
   * The gateway never sets it — it signs on behalf of a browser user. A
   * service calling another service signs with `signServiceIdentity` and does.
   * That distinction is the whole point: a valid signature proves "the gateway
   * or a service vouched for this user", NOT "this request came from inside".
   * Without `svc` an endpoint meant for internal callers only would still
   * accept any logged-in customer's request, because the gateway happily signs
   * those too. Guard internal-only routes on this claim, not on the signature
   * alone.
   */
  svc?:  string;
}

/**
 * Read the signing secret. Returns null when unset so callers can decide
 * whether that is fatal — the gateway warns, services in strict mode refuse.
 */
function getSecret(): string | null {
  const secret = process.env.INTERNAL_IDENTITY_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

/** True when a signing secret is configured and long enough to be meaningful. */
export function isInternalIdentityEnabled(): boolean {
  return getSecret() !== null;
}

/**
 * Mint an assertion for the verified caller. Returns null when no secret is
 * configured, so the gateway degrades to header-only mode rather than failing
 * every request during a rollout.
 */
export function signIdentity(sub: string, roles: string[]): string | null {
  const secret = getSecret();
  if (!secret) return null;

  return jwt.sign({ sub, roles }, secret, {
    expiresIn: TTL_SECONDS,
    issuer:    ISSUER,
    audience:  AUDIENCE,
  });
}

/**
 * Mint an assertion for a service-to-service call made on a user's behalf.
 *
 * Identical to `signIdentity` except it records which service is calling, so
 * the callee can require that a request originated inside the mesh rather than
 * from a browser that merely holds a valid session.
 *
 * `svc` is a claim, not a credential: anything holding the shared secret can
 * set it. It separates internal traffic from customer traffic; it does not
 * authenticate one service against another. Per-service keys would be needed
 * for that, and are the natural next step if services stop being equally
 * trusted.
 */
export function signServiceIdentity(sub: string, roles: string[], svc: string): string | null {
  const secret = getSecret();
  if (!secret) return null;

  return jwt.sign({ sub, roles, svc }, secret, {
    expiresIn: TTL_SECONDS,
    issuer:    ISSUER,
    audience:  AUDIENCE,
  });
}

/**
 * Verify an assertion minted by the gateway or by a peer service. Returns null
 * on any failure — bad signature, wrong issuer, expired, or malformed claims.
 */
export function verifyIdentity(token?: string): InternalIdentity | null {
  const secret = getSecret();
  if (!secret || !token) return null;

  try {
    const payload = jwt.verify(token, secret, {
      issuer:   ISSUER,
      audience: AUDIENCE,
    }) as Partial<InternalIdentity>;

    if (typeof payload.sub !== 'string' || !Array.isArray(payload.roles)) return null;
    return {
      sub:   payload.sub,
      roles: payload.roles.filter((r) => typeof r === 'string'),
      ...(typeof payload.svc === 'string' ? { svc: payload.svc } : {}),
    };
  } catch {
    return null;
  }
}
