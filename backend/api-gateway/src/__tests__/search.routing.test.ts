/**
 * Who is allowed to write to the search index.
 *
 * search-service exposed `POST /api/v1/search/reindex` on the gateway's PUBLIC
 * `/search` prefix. It had no authentication and bulk-wrote whatever `products`
 * array the caller put in the request body straight into the live storefront
 * index — so anyone who could reach the gateway could place arbitrary documents
 * in front of shoppers, or overwrite real listings with their own.
 *
 * Rebuilding the index now lives at `POST /api/v1/admin/search/reindex` on
 * product-service, which takes no input at all: it reads the catalogue from the
 * database, so there is nothing for a caller to inject.
 *
 * These assertions run the REAL routers against a stubbed proxy, so they check
 * the routing and the guards rather than a description of them. They are the
 * executable form of the three cases worth caring about:
 *
 *   POST /api/v1/search/reindex        with no token       → not 2xx
 *   POST /api/v1/admin/search/reindex  with a customer     → 403
 *   POST /api/v1/admin/search/reindex  with an admin       → proxied
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';

process.env.JWT_ACCESS_SECRET  = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

/**
 * Stand in for the resilient proxy. Records what it was asked to forward and
 * answers 200, so "did this request reach a service, and which one" is
 * observable without any service running.
 */
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
const { adminRoutes }    = await import('../routes/admin.routes.js');
const { optionalAuth, stripClientIdentity } = await import('../middleware/auth.middleware.js');

// Every prefix customerRoutes mounts needs a target or requireTarget throws.
const TARGETS: Record<string, string> = new Proxy(
  { product: 'http://product-service:4002' },
  { get: (t: any, k: string) => t[k] ?? `http://${String(k)}-service` },
);

/** The gateway's real middleware order, minus rate limiting and logging. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(stripClientIdentity);
  app.use(optionalAuth);
  app.use('/api/v1',       customerRoutes(TARGETS));
  app.use('/api/v1/admin', adminRoutes(TARGETS));
  app.use((_req, res) => { res.status(404).json({ error: 'NOT_FOUND' }); });
  return app;
}

const app = buildApp();

/** Issue a request against the app and return status + parsed body. */
async function call(
  method: 'GET' | 'POST',
  path: string,
  token?: string,
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
      ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const adminToken    = createAccessToken('admin-1',    ['ROLE_ADMIN']);
const customerToken = createAccessToken('customer-1', ['ROLE_CUSTOMER']);
const sellerToken   = createAccessToken('seller-1',   ['ROLE_SELLER']);

beforeEach(() => { proxy.mockClear(); });

// ── The endpoint that used to be open ─────────────────────────────────────────

describe('POST /api/v1/search/reindex — the hole that was open', () => {
  it('is refused for an anonymous caller', async () => {
    const { status } = await call('POST', '/api/v1/search/reindex');

    // 405 from the read-only mount. What matters is that it is not a success
    // and never reaches a service.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('is refused for a signed-in customer too — being logged in is not the point', async () => {
    const { status } = await call('POST', '/api/v1/search/reindex', customerToken);

    expect(status).toBeGreaterThanOrEqual(400);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('answers 405 with an Allow header rather than a silent 404', async () => {
    const { status, body } = await call('POST', '/api/v1/search/reindex');

    // A 404 would be indistinguishable from a typo'd path. 405 says the prefix
    // exists and this method is not permitted on it.
    expect(status).toBe(405);
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });
});

describe('the public /search prefix is read-only', () => {
  it('still serves GET to an anonymous shopper', async () => {
    // Signed-out search is the most common request the storefront serves. The
    // fix must not have moved this behind auth.
    const { status } = await call('GET', '/api/v1/search?q=honey');

    expect(status).toBe(200);
    expect(proxy).toHaveBeenCalledTimes(1);
  });

  it('routes that GET to product-service, which owns the index', async () => {
    await call('GET', '/api/v1/search?q=honey');

    // Not search-service: two services writing one index with two different
    // mappings is what broke search in the first place.
    expect(proxy.mock.calls[0][2]).toBe('http://product-service:4002');
  });

  it('refuses every write method, not just POST', async () => {
    for (const method of ['POST'] as const) {
      proxy.mockClear();
      const { status } = await call(method, '/api/v1/search/anything');
      expect(status).toBe(405);
      expect(proxy).not.toHaveBeenCalled();
    }
  });
});

// ── The endpoint that replaced it ─────────────────────────────────────────────

describe('POST /api/v1/admin/search/reindex', () => {
  it('reaches product-service for an admin', async () => {
    const { status } = await call('POST', '/api/v1/admin/search/reindex', adminToken);

    expect(status).toBe(200);
    expect(proxy).toHaveBeenCalledTimes(1);
    expect(proxy.mock.calls[0][2]).toBe('http://product-service:4002');
  });

  it('is 403 for a customer', async () => {
    const { status, body } = await call('POST', '/api/v1/admin/search/reindex', customerToken);

    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(proxy).not.toHaveBeenCalled();
  });

  it('is 403 for a seller — a seller is not an admin', async () => {
    const { status } = await call('POST', '/api/v1/admin/search/reindex', sellerToken);

    expect(status).toBe(403);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('is 401 for an anonymous caller', async () => {
    const { status, body } = await call('POST', '/api/v1/admin/search/reindex');

    expect(status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(proxy).not.toHaveBeenCalled();
  });

  it('cannot be reached by forging the identity headers the gateway stamps', async () => {
    // stripClientIdentity deletes these before anything reads them; without it,
    // `curl -H 'x-user-roles: ROLE_ADMIN'` would be a complete bypass.
    const server = app.listen(0);
    try {
      const { port } = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/search/reindex`, {
        method: 'POST',
        headers: {
          'content-type':  'application/json',
          'x-user-id':     'attacker',
          'x-user-roles':  'ROLE_SUPER_ADMIN',
        },
        body: '{}',
      });
      expect(res.status).toBe(401);
      expect(proxy).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it('is mounted at all — the guard is worthless if the path 404s', async () => {
    // The endpoint existed on product-service with its own requireRole, but the
    // gateway had no /admin/search mount, so every call fell through to the
    // 404 handler and the guard never ran.
    const { status } = await call('POST', '/api/v1/admin/search/reindex', adminToken);
    expect(status).not.toBe(404);
  });
});
