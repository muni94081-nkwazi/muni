/**
 * Who is allowed to reach the loyalty prefix.
 *
 * `/loyalty` was mounted with `pub()`, which forwards EVERY method with no
 * authentication. loyalty-service then took the caller from a "userId" in the
 * request body, falling back to a hardcoded 'user-123' — so naming another
 * customer in the body was enough to spend their rewards. The gateway strips the
 * x-user-id header, but it cannot strip a request body.
 *
 * The prefix now splits by what the response is about:
 *
 *   GET  /api/v1/loyalty/rewards        public catalogue  → proxied, no token
 *   GET  /api/v1/loyalty/tier/benefits  public catalogue  → proxied, no token
 *   POST /api/v1/loyalty/rewards        write on a public prefix → 405
 *   GET  /api/v1/loyalty/points         one user's balance → 401 without a token
 *   POST /api/v1/loyalty/redeem         spends a balance   → 401 without a token
 *
 * Like search.routing.test.ts, these run the REAL router against a stubbed
 * proxy, so they check the mounting and the guards rather than a description of
 * them. Registration order matters here — the two public paths must be mounted
 * before the authenticated catch-all — and that is exactly what a test of the
 * real router pins down.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';

process.env.JWT_ACCESS_SECRET  = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

const proxy = jest.fn<(...args: any[]) => any>(
  async (_req: any, res: any, target: string) => {
    res.status(200).json({ proxiedTo: target });
  },
);

jest.unstable_mockModule('../utils/proxy.js', () => ({
  proxy,
  registerTargets: jest.fn(),
}));

const { createAccessToken } = await import('../../../shared/utils/token.js');
const { customerRoutes } = await import('../routes/customer.routes.js');
const { optionalAuth, stripClientIdentity } = await import('../middleware/auth.middleware.js');

const TARGETS: Record<string, string> = new Proxy(
  { loyalty: 'http://loyalty-service:4030' },
  { get: (t: any, k: string) => t[k] ?? `http://${String(k)}-service` },
);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(stripClientIdentity);
  app.use(optionalAuth);
  app.use('/api/v1', customerRoutes(TARGETS));
  app.use((_req, res) => { res.status(404).json({ error: 'NOT_FOUND' }); });
  return app;
}

const app = buildApp();

async function call(
  method: 'GET' | 'POST',
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const customerToken = createAccessToken('customer-1', ['ROLE_CUSTOMER']);

beforeEach(() => {
  proxy.mockClear();
});

describe('gateway — loyalty catalogue stays public', () => {
  it('proxies the reward catalogue with no token', async () => {
    const res = await call('GET', '/api/v1/loyalty/rewards');
    expect(res.status).toBe(200);
    expect(proxy).toHaveBeenCalled();
  });

  it('proxies tier benefits with no token', async () => {
    const res = await call('GET', '/api/v1/loyalty/tier/benefits');
    expect(res.status).toBe(200);
    expect(proxy).toHaveBeenCalled();
  });

  it('refuses a write on the public catalogue prefix with 405', async () => {
    const res = await call('POST', '/api/v1/loyalty/rewards');
    expect(res.status).toBe(405);
    expect(proxy).not.toHaveBeenCalled();
  });
});

describe('gateway — user-scoped loyalty requires authentication', () => {
  const userScoped: Array<['GET' | 'POST', string]> = [
    ['GET',  '/api/v1/loyalty/points'],
    ['GET',  '/api/v1/loyalty/history'],
    ['POST', '/api/v1/loyalty/redeem'],
    ['POST', '/api/v1/loyalty/referral'],
    ['POST', '/api/v1/loyalty/birthday'],
  ];

  it.each(userScoped)('%s %s is refused without a token', async (method, path) => {
    const res = await call(method, path);
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(401);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('does not let a body userId stand in for a session', async () => {
    const res = await call('POST', '/api/v1/loyalty/redeem', undefined, {
      rewardId: 'r1',
      userId: 'victim',
    });
    expect(res.status).toBe(401);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('proxies to loyalty-service once the caller is authenticated', async () => {
    const res = await call('GET', '/api/v1/loyalty/points', customerToken);
    expect(res.status).toBe(200);
    expect(res.body.proxiedTo).toBe('http://loyalty-service:4030');
  });
});

describe('gateway — dead prefixes are not mounted', () => {
  it('does not expose /api/v1/qa', async () => {
    const res = await call('GET', '/api/v1/qa/products/p1/questions');
    expect(res.status).toBe(404);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('does not expose /api/v1/tracking', async () => {
    const res = await call('GET', '/api/v1/tracking/TRK-1');
    expect(res.status).toBe(404);
    expect(proxy).not.toHaveBeenCalled();
  });
});
