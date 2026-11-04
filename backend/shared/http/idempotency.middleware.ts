import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// ─── HTTP Idempotency ─────────────────────────────────────────────────────────
//
// Makes a state-changing request safe to repeat. The client sends a stable
// Idempotency-Key; the first request executes and its response is stored, and
// every replay of that key returns the stored response instead of executing
// again.
//
// This is what stands between a timed-out checkout and three debits against
// one order. The gateway's retry wrapper, a user double-tapping "Pay", and a
// flaky mobile connection all produce the same duplicate POST — without a key
// there is no way to tell them apart from two genuine purchases.
//
// Three states per key:
//   absent      → first caller; claim it and execute
//   IN_FLIGHT   → original still running; tell the client to retry shortly
//   DONE        → replay the stored status + body
//
// The body is fingerprinted alongside the key. Same key with a different body
// is a client bug (a recycled key), not a retry, and is rejected rather than
// silently answered with someone else's result.

const IN_FLIGHT = 'IN_FLIGHT';
const DONE      = 'DONE';

/** 24h — comfortably outlives any client, proxy or gateway retry window. */
const DEFAULT_TTL_SEC = 24 * 60 * 60;

/** Minimal surface we need; satisfied by node-redis v4 and ioredis alike. */
export interface IdempotencyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts: { NX?: boolean; EX?: number }): Promise<string | null>;
  del(key: string): Promise<number>;
}

export interface IdempotencyOptions {
  ttlSeconds?: number;
  /** Require the header (default true). When false, unkeyed requests pass through. */
  required?: boolean;
}

interface StoredResponse {
  status: number;
  body:   unknown;
}

function fingerprint(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex').slice(0, 32);
}

function errorEnvelope(code: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    success: false,
    data:    null,
    error:   { code, message, ...extra },
    meta:    { timestamp: new Date().toISOString() },
  };
}

export function idempotent(store: IdempotencyStore, options: IdempotencyOptions = {}) {
  const ttl      = options.ttlSeconds ?? DEFAULT_TTL_SEC;
  const required = options.required ?? true;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = req.header('idempotency-key');

    if (!rawKey) {
      if (!required) return next();
      res.status(400).json(errorEnvelope(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Send an Idempotency-Key header so this request can be safely retried.',
      ));
      return;
    }

    // Scope by user: two accounts choosing the same key must not collide, and
    // a key guessed by an attacker must not surface another user's response.
    const actor = (req.headers['x-user-id'] as string | undefined) ?? 'anonymous';
    const key   = `idem:${actor}:${rawKey}`;
    const hash  = fingerprint(req.body);

    let claimed: string | null;
    try {
      claimed = await store.set(key, `${IN_FLIGHT}:${hash}`, { NX: true, EX: ttl });
    } catch (err) {
      // Failing open would reintroduce double-charging, which is the exact
      // failure this middleware exists to prevent. Fail closed instead.
      res.status(503).json(errorEnvelope(
        'IDEMPOTENCY_UNAVAILABLE',
        'Unable to process payments safely right now. Please try again shortly.',
        { detail: (err as Error).message },
      ));
      return;
    }

    if (!claimed) {
      const stored = await store.get(key).catch(() => null);

      // Key vanished between SET NX and GET (expired, or evicted). Treat as
      // first-run rather than blocking a legitimate request forever.
      if (stored === null) return next();

      const separator  = stored.indexOf(':');
      const state      = stored.slice(0, separator);
      const remainder  = stored.slice(separator + 1);

      if (state === IN_FLIGHT) {
        if (remainder !== hash) {
          res.status(422).json(errorEnvelope(
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used with a different request body.',
          ));
          return;
        }
        res.setHeader('Retry-After', '2');
        res.status(409).json(errorEnvelope(
          'REQUEST_IN_PROGRESS',
          'The original request is still processing. Retry in a moment.',
        ));
        return;
      }

      // DONE — replay verbatim.
      try {
        const done = JSON.parse(remainder) as StoredResponse;
        res.setHeader('Idempotent-Replay', 'true');
        res.status(done.status).json(done.body);
      } catch {
        res.status(500).json(errorEnvelope(
          'IDEMPOTENCY_STORE_CORRUPT',
          'Stored response could not be replayed.',
        ));
      }
      return;
    }

    // ── First caller: capture the response so replays can be served from it ──
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      const status = res.statusCode;

      if (status >= 500) {
        // A 5xx is a genuine failure the client SHOULD be able to retry, so
        // release the key rather than pinning the error for 24 hours.
        void store.del(key).catch(() => undefined);
      } else {
        const payload: StoredResponse = { status, body };
        void store
          .set(key, `${DONE}:${JSON.stringify(payload)}`, { EX: ttl })
          .catch(() => undefined);
      }

      return originalJson(body);
    };

    next();
  };
}
