import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

// ─── Redis double ─────────────────────────────────────────────────────────────
//
// A faithful-enough sorted set so the Lua contract is exercised for real:
// trim by score, count, admit or reject, insert `cost` members.

type ZSet = Array<{ score: number; member: string }>;
const store = new Map<string, ZSet>();

let redisAvailable = true;
let evalShouldThrow = false;

const mockRedisClient = {
  eval: jest.fn(async (_script: string, opts: { keys: string[]; arguments: string[] }) => {
    if (evalShouldThrow) throw new Error('NOSCRIPT');

    const [key] = opts.keys;
    const [nowRaw, windowRaw, limitRaw, costRaw, member] = opts.arguments;
    const now = Number(nowRaw);
    const window = Number(windowRaw);
    const limit = Number(limitRaw);
    const cost = Number(costRaw);

    const set = (store.get(key) ?? []).filter((e) => e.score > now - window);
    const used = set.length;

    if (used + cost > limit) {
      store.set(key, set);
      return [0, Math.max(0, limit - used)];
    }

    for (let i = 1; i <= cost; i++) set.push({ score: now, member: `${member}:${i}` });
    store.set(key, set);
    return [1, limit - used - cost];
  }),
};

jest.unstable_mockModule('../db/redis.js', () => ({
  getRedisClient: () => (redisAvailable ? mockRedisClient : null),
  connectRedis: jest.fn(async () => undefined),
  disconnectRedis: jest.fn(async () => undefined),
  isRedisReady: () => redisAvailable,
}));

const { rateLimiter } = await import('../middleware/rate-limit.middleware.js');

/** Minimal Express doubles — only the members the middleware touches. */
function makeReq(overrides: { roles?: string; userId?: string; ip?: string; path?: string } = {}) {
  const headers: Record<string, string> = {};
  if (overrides.roles) headers['x-user-roles'] = overrides.roles;
  if (overrides.userId) headers['x-user-id'] = overrides.userId;
  return {
    headers,
    ip: overrides.ip ?? '192.168.1.1',
    path: overrides.path ?? '/api/v1/orders',
  } as unknown as Request;
}

function makeRes() {
  const res = {
    headers: {} as Record<string, unknown>,
    statusCode: 0,
    body: null as unknown,
    setHeader: jest.fn(function (this: typeof res, k: string, v: unknown) { this.headers[k] = v; }),
    status: jest.fn(function (this: typeof res, c: number) { this.statusCode = c; return this; }),
    json: jest.fn(function (this: typeof res, b: unknown) { this.body = b; return this; }),
  };
  return res;
}

const asRes = (r: ReturnType<typeof makeRes>) => r as unknown as Response;

describe('rateLimiter', () => {
  let res: ReturnType<typeof makeRes>;
  let next: NextFunction;

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    redisAvailable = true;
    evalShouldThrow = false;
    res = makeRes();
    next = jest.fn() as unknown as NextFunction;
  });

  // ── Tiers ──────────────────────────────────────────────────────────────────

  it('allows an anonymous request under the 100/min default limit', async () => {
    await rateLimiter()(makeReq(), asRes(res), next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.headers['X-RateLimit-Limit']).toBe(100);
  });

  it('lifts sellers to 1000/min and admins to 5000/min', async () => {
    await rateLimiter()(makeReq({ roles: 'ROLE_SELLER' }), asRes(res), next);
    expect(res.headers['X-RateLimit-Limit']).toBe(1000);

    const adminRes = makeRes();
    await rateLimiter()(makeReq({ roles: 'ROLE_ADMIN' }), asRes(adminRes), next);
    expect(adminRes.headers['X-RateLimit-Limit']).toBe(5000);
  });

  it('picks the highest tier when several roles are present', async () => {
    await rateLimiter()(makeReq({ roles: 'ROLE_CUSTOMER,ROLE_ADMIN' }), asRes(res), next);
    expect(res.headers['X-RateLimit-Limit']).toBe(5000);
  });

  // ── Enforcement ────────────────────────────────────────────────────────────

  it('rejects with 429 once the window is exhausted', async () => {
    const limiter = rateLimiter();
    const req = makeReq({ roles: 'ROLE_CUSTOMER' });

    for (let i = 0; i < 100; i++) await limiter(req, asRes(makeRes()), next);
    await limiter(req, asRes(res), next);

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('sets Retry-After alongside the 429', async () => {
    const limiter = rateLimiter();
    const req = makeReq({ roles: 'ROLE_CUSTOMER' });
    for (let i = 0; i < 100; i++) await limiter(req, asRes(makeRes()), next);

    await limiter(req, asRes(res), next);
    expect(res.headers['Retry-After']).toBeGreaterThan(0);
  });

  it('slides rather than resetting on a fixed boundary', async () => {
    const limiter = rateLimiter(1_000);
    const req = makeReq({ roles: 'ROLE_CUSTOMER' });

    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start);
    for (let i = 0; i < 100; i++) await limiter(req, asRes(makeRes()), next);

    // 999ms later the earlier requests are still inside the window.
    jest.spyOn(Date, 'now').mockReturnValue(start + 999);
    await limiter(req, asRes(res), next);
    expect(res.statusCode).toBe(429);

    // Past the window they age out and capacity returns.
    jest.spyOn(Date, 'now').mockReturnValue(start + 1_001);
    const after = makeRes();
    await limiter(req, asRes(after), next);
    expect(after.status).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  // ── Per-endpoint cost ──────────────────────────────────────────────────────

  it('exempts health and metrics entirely', async () => {
    await rateLimiter()(makeReq({ path: '/health/ready' }), asRes(res), next);
    expect(next).toHaveBeenCalled();
    expect(mockRedisClient.eval).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('charges checkout 20x and search 5x', async () => {
    await rateLimiter()(makeReq({ path: '/api/v1/checkout/initiate' }), asRes(res), next);
    expect(res.headers['X-RateLimit-Cost']).toBe(20);
    expect(res.headers['X-RateLimit-Remaining']).toBe(80);

    const searchRes = makeRes();
    await rateLimiter()(makeReq({ path: '/api/v1/search', ip: '10.0.0.2' }), asRes(searchRes), next);
    expect(searchRes.headers['X-RateLimit-Cost']).toBe(5);
    expect(searchRes.headers['X-RateLimit-Remaining']).toBe(95);
  });

  it('exhausts an anonymous budget in 5 checkout calls, not 100', async () => {
    const limiter = rateLimiter();
    const req = makeReq({ path: '/api/v1/checkout/initiate' });

    for (let i = 0; i < 5; i++) await limiter(req, asRes(makeRes()), next);
    await limiter(req, asRes(res), next);

    expect(res.statusCode).toBe(429);
  });

  it('throttles login attempts at 10x to brake credential stuffing', async () => {
    await rateLimiter()(makeReq({ path: '/api/v1/auth/login' }), asRes(res), next);
    expect(res.headers['X-RateLimit-Cost']).toBe(10);
  });

  // ── Keying ─────────────────────────────────────────────────────────────────

  it('keys on the user id rather than the ip when x-user-id is present', async () => {
    await rateLimiter()(makeReq({ userId: 'user-42' }), asRes(res), next);

    expect(store.has('rl:u:user-42')).toBe(true);
    expect(store.has('rl:ip:192.168.1.1')).toBe(false);
  });

  it('namespaces user keys apart from ip keys', async () => {
    await rateLimiter()(makeReq({ userId: '10.0.0.1' }), asRes(res), next);
    await rateLimiter()(makeReq({ ip: '10.0.0.1' }), asRes(makeRes()), next);

    // A user literally named after an IP must not share that IP's budget.
    expect(store.get('rl:u:10.0.0.1')).toHaveLength(1);
    expect(store.get('rl:ip:10.0.0.1')).toHaveLength(1);
  });

  // ── Degradation ────────────────────────────────────────────────────────────

  it('falls back to the in-process counter when Redis is unavailable', async () => {
    redisAvailable = false;

    await rateLimiter()(makeReq({ ip: '10.0.0.9' }), asRes(res), next);

    expect(next).toHaveBeenCalled();
    expect(mockRedisClient.eval).not.toHaveBeenCalled();
    expect(res.headers['X-RateLimit-Limit']).toBe(100);
  });

  it('falls back when the Lua script itself fails', async () => {
    evalShouldThrow = true;

    await rateLimiter()(makeReq({ ip: '10.0.0.10' }), asRes(res), next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still enforces a limit while degraded', async () => {
    redisAvailable = false;
    const limiter = rateLimiter();
    const req = makeReq({ ip: '10.0.0.11', roles: 'ROLE_CUSTOMER' });

    for (let i = 0; i < 100; i++) await limiter(req, asRes(makeRes()), next);
    await limiter(req, asRes(res), next);

    expect(res.statusCode).toBe(429);
  });
});
