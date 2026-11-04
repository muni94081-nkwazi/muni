import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getRedisClient } from '../db/redis.js';

// ─── Redis-backed Sliding Window Rate Limiter ─────────────────────────────────
//
// Algorithm: sliding window log in a sorted set, evaluated in a single Lua
// script so the trim / count / admit sequence is atomic. A fixed-window
// counter (the previous implementation) lets a client spend its whole budget
// at 0:59 and again at 1:00 — 2× the configured limit across the boundary.
//
// Keying: the verified `x-user-id` when present, otherwise the client IP.
// This is only sound because stripClientIdentity() deletes any client-supplied
// x-user-id before this middleware runs — without it, rotating a random UUID
// per request would bypass the limiter entirely.
//
// Cost weighting: one bucket for all endpoints means /checkout competes with
// /health. Expensive routes now draw proportionally more from the budget.
//
// Fallback: if Redis is unreachable the limiter degrades to a per-process
// token bucket sized to limit/replicaCount, so the fleet-wide ceiling stays
// roughly correct instead of multiplying by the number of pods.
//
// Tiers (requests per windowMs, at cost 1):
//   Anonymous / ROLE_CUSTOMER  → 100  req / 60 s
//   ROLE_SELLER                → 1000 req / 60 s
//   ROLE_ADMIN / SUPER_ADMIN   → 5000 req / 60 s

// ─── Tier Config ──────────────────────────────────────────────────────────────

const TIERS: Array<{ roles: string[]; limit: number }> = [
  { roles: ['ROLE_SUPER_ADMIN', 'ROLE_ADMIN'], limit: 5_000 },
  { roles: ['ROLE_SELLER'],                    limit: 1_000 },
  { roles: ['ROLE_CUSTOMER'],                  limit:   100 },
];
const DEFAULT_LIMIT = 100;

function getLimitForRoles(rolesHeader: string | undefined): number {
  if (!rolesHeader) return DEFAULT_LIMIT;
  const roles = rolesHeader.split(',');
  for (const tier of TIERS) {
    if (tier.roles.some((r) => roles.includes(r))) return tier.limit;
  }
  return DEFAULT_LIMIT;
}

// ─── Per-Endpoint Cost ────────────────────────────────────────────────────────
//
// Cost 0 exempts a route entirely (health checks must never be throttled —
// a rate-limited readiness probe takes the pod out of service).

const ENDPOINT_COSTS: Array<[RegExp, number]> = [
  [/^\/health/,                      0],
  [/^\/metrics/,                     0],
  [/^\/api\/v1\/checkout/,          20],
  [/^\/api\/v1\/payments/,          20],
  [/^\/api\/v1\/auth\/login/,       10],  // credential-stuffing brake
  [/^\/api\/v1\/auth\/register/,    10],
  [/^\/api\/v1\/auth\/2fa/,         10],  // TOTP brute-force brake
  // The password-reset pair, for two different reasons:
  //   forgot-password sends an email per call, so at cost 1 a single IP could
  //   fire 100 messages a minute at one inbox — mail-bombing the shopper and
  //   burning the sending domain's reputation.
  //   reset-password checks a six-digit OTP, so at cost 1 it is a brute-force
  //   oracle over a 10^6 space with a 15-minute window. auth-service also
  //   counts attempts per account now (see resetPassword), which is the limit
  //   that matters when the guesses arrive from many IPs; this one bounds a
  //   single source.
  [/^\/api\/v1\/auth\/(forgot|reset)-password/, 10],
  [/^\/api\/v1\/search/,             5],
  [/^\/api\/v1\/products/,           2],
];

function costFor(path: string): number {
  for (const [pattern, cost] of ENDPOINT_COSTS) {
    if (pattern.test(path)) return cost;
  }
  return 1;
}

// ─── Sliding Window Script ────────────────────────────────────────────────────
//
// KEYS[1] = bucket key
// ARGV    = now(ms), windowMs, limit, cost, member-prefix
// Returns { allowed, remaining }
//
// `cost` is spent by inserting `cost` members, so a single expensive call
// draws proportionally without needing a second key or a read-modify-write.

const SLIDING_WINDOW_LUA = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local cost   = tonumber(ARGV[4])
local member = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local used = redis.call('ZCARD', key)

if used + cost > limit then
  return { 0, math.max(0, limit - used) }
end

for i = 1, cost do
  redis.call('ZADD', key, now, member .. ':' .. i)
end
redis.call('PEXPIRE', key, window)

return { 1, limit - used - cost }
`;

// ─── In-Process Fallback (bounded) ────────────────────────────────────────────
//
// The previous fallback was an unbounded Map that was never pruned: one entry
// per distinct key, retained forever, ending in an OOM kill. This one sweeps
// expired entries and hard-caps its size.

interface WindowEntry { count: number; resetAt: number }

const MAX_FALLBACK_ENTRIES = 10_000;
const fallbackStore = new Map<string, WindowEntry>();

function fallbackTake(key: string, limit: number, cost: number, windowMs: number): {
  allowed: boolean; remaining: number; resetMs: number;
} {
  const now = Date.now();

  // Amortised sweep — only when the map is under pressure.
  if (fallbackStore.size >= MAX_FALLBACK_ENTRIES) {
    for (const [k, entry] of fallbackStore) {
      if (entry.resetAt <= now) fallbackStore.delete(k);
    }
    // Still full of live entries: evict oldest-inserted (Map preserves order).
    while (fallbackStore.size >= MAX_FALLBACK_ENTRIES) {
      const oldest = fallbackStore.keys().next().value;
      if (oldest === undefined) break;
      fallbackStore.delete(oldest);
    }
  }

  const current = fallbackStore.get(key);
  if (!current || current.resetAt <= now) {
    fallbackStore.set(key, { count: cost, resetAt: now + windowMs });
    return { allowed: cost <= limit, remaining: Math.max(0, limit - cost), resetMs: windowMs };
  }

  if (current.count + cost > limit) {
    return { allowed: false, remaining: Math.max(0, limit - current.count), resetMs: current.resetAt - now };
  }

  current.count += cost;
  return { allowed: true, remaining: limit - current.count, resetMs: current.resetAt - now };
}

/** Replica count so the local fallback approximates the fleet-wide ceiling. */
const REPLICAS = Math.max(1, Number(process.env.GATEWAY_REPLICAS ?? 1));

// ─── Middleware Factory ───────────────────────────────────────────────────────

export function rateLimiter(windowMs = 60_000) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cost = costFor(req.path);
    if (cost === 0) return next();

    const roles  = req.headers['x-user-roles'] as string | undefined;
    const userId = req.headers['x-user-id']    as string | undefined;
    const limit  = getLimitForRoles(roles);

    // Namespaced so a user id can never collide with an IP-derived key.
    const key = userId ? `rl:u:${userId}` : `rl:ip:${req.ip ?? 'unknown'}`;

    let allowed:   boolean;
    let remaining: number;
    let resetMs = windowMs;

    const redis = getRedisClient();

    if (redis) {
      try {
        const [ok, rem] = (await redis.eval(SLIDING_WINDOW_LUA, {
          keys: [key],
          arguments: [
            String(Date.now()),
            String(windowMs),
            String(limit),
            String(cost),
            randomUUID(),
          ],
        })) as [number, number];

        allowed   = ok === 1;
        remaining = rem;
      } catch {
        // Script or connection failure — degrade rather than reject traffic.
        ({ allowed, remaining, resetMs } = fallbackTake(key, Math.ceil(limit / REPLICAS), cost, windowMs));
      }
    } else {
      ({ allowed, remaining, resetMs } = fallbackTake(key, Math.ceil(limit / REPLICAS), cost, windowMs));
    }

    res.setHeader('X-RateLimit-Limit',     limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Cost',      cost);
    res.setHeader('X-RateLimit-Reset',     Math.floor((Date.now() + resetMs) / 1000));

    if (!allowed) {
      const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
      res.setHeader('Retry-After', retryAfter);
      // Same envelope as every other gateway error, so clients parse one shape.
      return res.status(429).json({
        success: false,
        data:    null,
        error:   { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
        meta:    {
          retryAfter,
          limit,
          remaining: Math.max(0, remaining),
          timestamp: new Date().toISOString(),
          service:   'api-gateway',
        },
      });
    }

    next();
  };
}
