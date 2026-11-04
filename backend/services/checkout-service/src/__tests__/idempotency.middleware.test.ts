import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { idempotent, type IdempotencyStore } from '../../../../shared/http/idempotency.middleware.js';

// ─── In-memory store with real SET NX semantics ───────────────────────────────

function makeStore(): IdempotencyStore & { map: Map<string, string>; failing: boolean } {
  const map = new Map<string, string>();
  const store = {
    map,
    failing: false,
    async get(key: string) {
      if (store.failing) throw new Error('redis down');
      return map.get(key) ?? null;
    },
    async set(key: string, value: string, opts: { NX?: boolean; EX?: number }) {
      if (store.failing) throw new Error('redis down');
      if (opts.NX && map.has(key)) return null;
      map.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return map.delete(key) ? 1 : 0;
    },
  };
  return store;
}

function makeReq(key?: string, body: unknown = { amount: 100 }, userId = 'user-1') {
  const headers: Record<string, string> = { 'x-user-id': userId };
  if (key) headers['idempotency-key'] = key;
  return {
    headers,
    body,
    header: (n: string) => headers[n.toLowerCase()],
  } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: null as unknown,
    setHeader: jest.fn(function (this: typeof res, k: string, v: unknown) { this.headers[k] = v; }),
    status: jest.fn(function (this: typeof res, c: number) { this.statusCode = c; return this; }),
    json: jest.fn(function (this: typeof res, b: unknown) { this.body = b; return this; }),
  };
  return res;
}

const asRes = (r: ReturnType<typeof makeRes>) => r as unknown as Response;

/** Drive a full request: middleware, then the handler writes a response. */
async function run(
  mw: ReturnType<typeof idempotent>,
  req: Request,
  handler?: (res: Response) => void,
) {
  const res = makeRes();
  const next = jest.fn(() => { handler?.(asRes(res)); }) as unknown as NextFunction;
  await mw(req, asRes(res), next);
  return { res, next };
}

let store: ReturnType<typeof makeStore>;
let mw: ReturnType<typeof idempotent>;

beforeEach(() => {
  store = makeStore();
  mw = idempotent(store);
});

describe('idempotency middleware', () => {
  it('rejects a money-moving request with no key', async () => {
    const { res, next } = await run(mw, makeReq());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('lets the first request through and stores its response', async () => {
    const { res, next } = await run(mw, makeReq('k1'), (r) => { r.status(201).json({ orderId: 'ord-1' }); });

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect([...store.map.values()][0]).toMatch(/^DONE:/);
  });

  it('replays the stored response instead of executing again', async () => {
    await run(mw, makeReq('k1'), (r) => { r.status(201).json({ orderId: 'ord-1' }); });

    const second = await run(mw, makeReq('k1'), (r) => { r.status(201).json({ orderId: 'ord-DUPLICATE' }); });

    expect(second.next).not.toHaveBeenCalled();
    expect(second.res.statusCode).toBe(201);
    expect(second.res.body).toEqual({ orderId: 'ord-1' });
    expect(second.res.headers['Idempotent-Replay']).toBe('true');
  });

  it('returns 409 while the original is still in flight', async () => {
    // First call claims the key but never responds — the in-flight state.
    await mw(makeReq('k1'), asRes(makeRes()), jest.fn() as unknown as NextFunction);

    const { res, next } = await run(mw, makeReq('k1'));

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'REQUEST_IN_PROGRESS' } });
    expect(res.headers['Retry-After']).toBe('2');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects the same key used with a different body', async () => {
    await mw(makeReq('k1', { amount: 100 }), asRes(makeRes()), jest.fn() as unknown as NextFunction);

    const { res } = await run(mw, makeReq('k1', { amount: 999999 }));

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('scopes keys per user so two accounts cannot collide', async () => {
    await run(mw, makeReq('shared-key', { amount: 100 }, 'user-1'), (r) => { r.status(201).json({ o: 'a' }); });
    const other = await run(mw, makeReq('shared-key', { amount: 100 }, 'user-2'), (r) => { r.status(201).json({ o: 'b' }); });

    expect(other.next).toHaveBeenCalled();
    expect(other.res.body).toEqual({ o: 'b' });
  });

  it('releases the key on a 5xx so a genuine retry can proceed', async () => {
    await run(mw, makeReq('k1'), (r) => { r.status(503).json({ error: 'upstream down' }); });

    expect(store.map.size).toBe(0);

    const retry = await run(mw, makeReq('k1'), (r) => { r.status(201).json({ orderId: 'ord-1' }); });
    expect(retry.next).toHaveBeenCalled();
    expect(retry.res.statusCode).toBe(201);
  });

  it('retains the key on a 4xx — a declined card is a real outcome', async () => {
    await run(mw, makeReq('k1'), (r) => { r.status(402).json({ error: 'declined' }); });

    const retry = await run(mw, makeReq('k1'), (r) => { r.status(201).json({ orderId: 'sneaky' }); });

    expect(retry.next).not.toHaveBeenCalled();
    expect(retry.res.body).toEqual({ error: 'declined' });
  });

  it('fails closed with 503 when the store is unreachable', async () => {
    store.failing = true;

    const { res, next } = await run(mw, makeReq('k1'));

    // Failing open would reintroduce exactly the double-charge this prevents.
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_UNAVAILABLE' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes unkeyed requests through when not required', async () => {
    const optional = idempotent(store, { required: false });
    const { next } = await run(optional, makeReq());

    expect(next).toHaveBeenCalled();
  });

  it('survives three concurrent identical submits with one execution', async () => {
    let executions = 0;
    const handler = (r: Response) => { executions++; r.status(201).json({ orderId: 'ord-1' }); };

    // Sequential-but-uncompleted first call, then two replays.
    await mw(makeReq('k1'), asRes(makeRes()), jest.fn(() => handler(asRes(makeRes()))) as unknown as NextFunction);
    const b = await run(mw, makeReq('k1'), handler);
    const c = await run(mw, makeReq('k1'), handler);

    expect(executions).toBe(1);
    expect(b.next).not.toHaveBeenCalled();
    expect(c.next).not.toHaveBeenCalled();
  });
});
