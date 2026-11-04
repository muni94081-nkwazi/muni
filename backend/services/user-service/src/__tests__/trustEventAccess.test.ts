import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

// ─── Who may write a seller trust event ───────────────────────────────────────
//
// `POST /sellers/:sellerId/trust-events` had no guard whatsoever, and the
// gateway proxies /sellers with `pub` — every method, no auth — so any
// unauthenticated request from the internet could post events against any
// seller id. Those events are the input to the trust score and to standing, so
// forged SLA_BREACHED or DISPUTE_OPENED events could push a competitor toward
// AT_RISK, and forged favourable ones could pull a score up.

process.env.INTERNAL_IDENTITY_SECRET ??= 'test-internal-identity-secret-at-least-32-chars';
process.env.DATABASE_URL ??= 'postgresql://muni:muni@localhost:5432/muni_user_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const SELLER_ID = 'seller-user-1';
const OTHER_SELLER_ID = 'seller-user-2';

/** Stands in for a real Bearer token; `authenticate` is mocked to read it. */
const verifyAccessToken = jest.fn<(token: string) => { sub: string; email: string; role: string }>();

jest.unstable_mockModule('../utils/tokens.js', () => ({
  verifyAccessToken,
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

type Middleware = typeof import('../middleware/authorizeTrustEvent.js');
let authorizeTrustEvent: Middleware['authorizeTrustEvent'];
let signServiceIdentity: (sub: string, roles: string[], svc: string) => string | null;
let signIdentity: (sub: string, roles: string[]) => string | null;
let INTERNAL_IDENTITY_HEADER: string;

beforeAll(async () => {
  ({ authorizeTrustEvent } = await import('../middleware/authorizeTrustEvent.js'));
  ({ signServiceIdentity, signIdentity, INTERNAL_IDENTITY_HEADER } = await import(
    '../../../../shared/utils/internal-identity.js'
  ));
});

interface Outcome {
  allowed: boolean;
  statusCode?: number;
  message?: string;
}

/**
 * Runs the guard for one caller and reports whether it reached the handler.
 * `next()` with no argument means allowed; `next(err)` means rejected.
 */
function run(options: {
  authorization?: string;
  internalIdentity?: string | null;
  sellerId?: string;
}): Outcome {
  const headers: Record<string, string> = {};
  if (options.authorization) headers.authorization = options.authorization;
  if (options.internalIdentity) headers[INTERNAL_IDENTITY_HEADER] = options.internalIdentity;

  const req = { headers, params: { sellerId: options.sellerId ?? SELLER_ID } } as never;
  const res = { locals: {} } as never;

  let outcome: Outcome = { allowed: false };
  authorizeTrustEvent(req, res, (err?: unknown) => {
    if (!err) {
      outcome = { allowed: true };
      return;
    }
    const e = err as { statusCode?: number; message?: string };
    outcome = { allowed: false, statusCode: e.statusCode, message: e.message };
  });

  return outcome;
}

beforeEach(() => {
  jest.clearAllMocks();
  verifyAccessToken.mockImplementation(() => {
    throw new Error('no stub configured');
  });
});

/** Makes a Bearer token resolve to this identity. */
function asUser(id: string, role: string): string {
  verifyAccessToken.mockReturnValue({ sub: id, email: `${id}@example.test`, role });
  return 'Bearer stub-token';
}

describe('unauthenticated callers are rejected', () => {
  it('rejects a request with no credentials at all', () => {
    const result = run({});

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it('rejects a malformed Authorization header', () => {
    const result = run({ authorization: 'stub-token-without-a-scheme' });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it('rejects an invalid or expired Bearer token', () => {
    verifyAccessToken.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const result = run({ authorization: 'Bearer expired-token' });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it('rejects a forged internal-identity header', () => {
    const result = run({ internalIdentity: 'not.a.real.assertion' });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
  });
});

describe('a seller writing against another seller is rejected', () => {
  it('refuses events aimed at a different seller id', () => {
    const result = run({
      authorization: asUser(OTHER_SELLER_ID, 'SELLER'),
      sellerId: SELLER_ID,
    });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it('refuses a signed-in customer writing about a seller', () => {
    const result = run({
      authorization: asUser('customer-9', 'CUSTOMER'),
      sellerId: SELLER_ID,
    });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it('does not accept a gateway-signed shopper assertion as an internal caller', () => {
    // signIdentity is what the gateway mints for an ordinary logged-in user:
    // a valid signature with no `svc` claim. Accepting it here would mean any
    // shopper could write trust events, which is why the guard tests `svc`
    // rather than trusting the signature alone.
    const shopperAssertion = signIdentity('customer-9', ['ROLE_CUSTOMER']);
    expect(shopperAssertion).toBeTruthy();

    const result = run({ internalIdentity: shopperAssertion, sellerId: SELLER_ID });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
  });
});

describe('a seller writing against their own id is allowed', () => {
  it('allows the seller whose id is in the path', () => {
    const result = run({
      authorization: asUser(SELLER_ID, 'SELLER'),
      sellerId: SELLER_ID,
    });

    expect(result.allowed).toBe(true);
  });
});

describe('admins are allowed', () => {
  it('allows an admin to write against any seller', () => {
    // Admins already manage sellers through this router: /verify and /standing
    // are both requireRole('ADMIN').
    const result = run({
      authorization: asUser('admin-1', 'ADMIN'),
      sellerId: SELLER_ID,
    });

    expect(result.allowed).toBe(true);
  });
});

describe('peer services keep working', () => {
  it.each(['dispute-service', 'buyer-protection-service'])(
    'allows %s, which reports lifecycle events with no end user behind the call',
    (service) => {
      const assertion = signServiceIdentity(SELLER_ID, [], service);
      expect(assertion).toBeTruthy();

      const result = run({ internalIdentity: assertion, sellerId: SELLER_ID });

      expect(result.allowed).toBe(true);
    },
  );

  it('does not require a Bearer token from a peer service', () => {
    // These clients have no user context and send no Authorization header. If
    // the guard demanded one, every dispute and delivery signal would be
    // rejected — silently, because both clients swallow failures by design.
    const assertion = signServiceIdentity(OTHER_SELLER_ID, [], 'dispute-service');
    const result = run({ internalIdentity: assertion, sellerId: SELLER_ID });

    expect(result.allowed).toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });
});
