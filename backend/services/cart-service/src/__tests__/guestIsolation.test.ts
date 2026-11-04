/**
 * guestIsolation.test.ts
 *
 * Two anonymous shoppers must never share a cart.
 *
 * `resolveIdentity` fell back to the literal key `'guest'` when a request had
 * neither an authenticated user nor an X-Cart-Session header — one bucket for
 * every such caller on the platform. Verified live before this fix: one
 * anonymous caller read another's productId, productName, productImage, price,
 * quantity, sellerId and variantId, and deleted their line with a 204.
 *
 * A missing header now mints a session instead, returned on the response so the
 * caller can keep addressing the same cart.
 *
 * These drive the real controllers against an in-memory Redis double, so they
 * check the key each request actually resolves to rather than a description
 * of it.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response } from 'express';

const store = new Map<string, string>();
const mockRedis = {
  get: jest.fn<(key: string) => Promise<string | null>>(async (key) => store.get(key) ?? null),
  set: jest.fn<(...args: any[]) => Promise<string>>(async (key: string, value: string) => {
    store.set(key, value);
    return 'OK';
  }),
  del: jest.fn<(key: string) => Promise<number>>(async (key) => (store.delete(key) ? 1 : 0)),
};
jest.unstable_mockModule('../utils/redis.js', () => ({ redis: mockRedis }));

jest.unstable_mockModule('../clients/discount.client.js', () => ({
  quoteCoupon: jest.fn<(...args: any[]) => Promise<any>>(
    async () => ({ outcome: 'unavailable', reason: 'not stubbed' }),
  ),
}));

const controller = await import('../controllers/cart.controller.js');
const { optionalAuth, requireAuth } = await import('../middleware/auth.middleware.js');
const { signIdentity } = await import('../../../../shared/utils/internal-identity.js');

/** An Express response double that records status, body and headers. */
function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: 200,
    body: undefined as any,
    headers,
    setHeader(name: string, value: string) { headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    send() { return this; },
  };
  return res as unknown as Response & {
    statusCode: number; body: any; headers: Record<string, string>;
  };
}

const ITEM = {
  productId: 'p-1',
  sellerId: 's-1',
  productName: 'Kabira Coffee Press',
  productImage: 'https://cdn.example.test/press.webp',
  price: 45_000,
  quantity: 1,
  maxQuantity: 10,
  variantId: 'v-1',
};

type Headers = Record<string, string>;

/**
 * Drives a handler the way the route does: identity middleware first, then the
 * controller.
 *
 * `optionalAuth` is what fills in `res.locals.userId`, and the controller reads
 * only that — it used to read the raw `x-user-id` header itself, so a
 * hand-written header outranked the gateway's verified identity. Running the
 * real middleware here keeps these cases honest: with no signing secret set
 * (the default below) a stamped x-user-id still resolves, exactly as it does in
 * a dev checkout, and the signed-mode case is covered at the bottom of the file.
 */
const call = async (
  fn: (r: Request, s: Response) => Promise<void>,
  { headers = {} as Headers, body = {}, params = {} as Record<string, string> } = {},
) => {
  const res = makeRes();
  const req = { headers, body, params } as unknown as Request;
  optionalAuth(req, res, () => undefined); // synchronous; never rejects
  await fn(req, res);
  return res;
};

/** The same, for the one route mounted with `requireAuth` rather than `optionalAuth`. */
const callGuarded = async (
  fn: (r: Request, s: Response) => Promise<void>,
  { headers = {} as Headers, body = {}, params = {} as Record<string, string> } = {},
) => {
  const res = makeRes();
  const req = { headers, body, params } as unknown as Request;
  // Synchronous in both outcomes: it either calls next() or has already
  // answered 401, in which case the handler must not run.
  let authorised = false;
  requireAuth(req, res, () => { authorised = true; });
  if (authorised) await fn(req, res);
  return res;
};

const addItem   = (headers: Headers, body: object = ITEM) => call(controller.addItem, { headers, body });
const getCart   = (headers: Headers) => call(controller.getCart, { headers });
const clearCart = (headers: Headers) => call(controller.clearCart, { headers });
const removeItem = (headers: Headers, itemId: string) =>
  call(controller.removeItem, { headers, params: { itemId } });

beforeEach(() => {
  store.clear();
  // Header mode for the cases below: cart.service.ts calls dotenv.config(), so
  // the repo .env would otherwise decide which identity mode these run in.
  // Unset, a gateway-stamped x-user-id resolves, as it does in a dev checkout;
  // the signed-mode behaviour is pinned in its own describe at the bottom.
  delete process.env.INTERNAL_IDENTITY_SECRET;
});

// ─── The bug ──────────────────────────────────────────────────────────────────

describe('two requests without a session never share a cart', () => {
  it('mints a session for a guest who sends none', async () => {
    const res = await getCart({});

    expect(res.headers['X-Cart-Session']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('gives two sessionless guests DIFFERENT sessions', async () => {
    const a = await getCart({});
    const b = await getCart({});

    expect(a.headers['X-Cart-Session']).not.toBe(b.headers['X-Cart-Session']);
  });

  it('does not show guest B what guest A added — the leak', async () => {
    await addItem({});                      // guest A, no session
    const b = await getCart({});            // guest B, no session

    expect(b.body.data.items).toHaveLength(0);
    // None of the fields that used to cross over.
    expect(JSON.stringify(b.body)).not.toContain('Kabira Coffee Press');
    expect(JSON.stringify(b.body)).not.toContain('p-1');
  });

  it('writes each sessionless guest to a distinct key, never a shared one', async () => {
    await addItem({});
    await addItem({});

    const keys = [...store.keys()];
    expect(keys).toHaveLength(2);
    expect(keys.some((k) => k === 'guest' || k.endsWith(':guest'))).toBe(false);
  });

  it('lets guest B neither delete nor clear guest A’s cart', async () => {
    const a = await addItem({});
    const sessionA = a.headers['X-Cart-Session'];
    const lineId = a.body.data.items[0].id;

    // Guest B, sessionless, tries both destructive operations.
    await removeItem({}, lineId);
    await clearCart({});

    const stillA = await getCart({ 'x-cart-session': sessionA });
    expect(stillA.body.data.items).toHaveLength(1);
    expect(stillA.body.data.items[0].productName).toBe('Kabira Coffee Press');
  });
});

// ─── What must keep working ───────────────────────────────────────────────────

describe('a guest keeps their cart by reusing the session they were given', () => {
  it('returns the same cart on the next request', async () => {
    const first = await addItem({});
    const session = first.headers['X-Cart-Session'];

    const again = await getCart({ 'x-cart-session': session });

    expect(again.body.data.items).toHaveLength(1);
    expect(again.body.data.items[0].productId).toBe('p-1');
  });

  it('does not mint a second session when one was supplied', async () => {
    const res = await getCart({ 'x-cart-session': 'client-chosen-session' });

    expect(res.headers['X-Cart-Session']).toBeUndefined();
  });
});

describe('explicit sessions stay isolated from each other', () => {
  it('keeps two supplied sessions apart', async () => {
    await addItem({ 'x-cart-session': 'session-one' });
    const other = await getCart({ 'x-cart-session': 'session-two' });

    expect(other.body.data.items).toHaveLength(0);
  });
});

describe('authenticated carts are unaffected', () => {
  it('keys an authenticated request by its user id, not a guest session', async () => {
    await addItem({ 'x-user-id': 'user-77' });

    expect([...store.keys()].some((k) => k.includes('user-77'))).toBe(true);
    expect([...store.keys()].some((k) => k.startsWith('guest:'))).toBe(false);
  });

  it('ignores a cart session when the caller is authenticated', async () => {
    await addItem({ 'x-user-id': 'user-77' });
    const guest = await getCart({ 'x-cart-session': 'some-guest-session' });

    expect(guest.body.data.items).toHaveLength(0);
  });

  it('mints no session for an authenticated caller', async () => {
    const res = await getCart({ 'x-user-id': 'user-77' });

    expect(res.headers['X-Cart-Session']).toBeUndefined();
  });

  it('keeps two authenticated users apart', async () => {
    await addItem({ 'x-user-id': 'user-a' });
    const other = await getCart({ 'x-user-id': 'user-b' });

    expect(other.body.data.items).toHaveLength(0);
  });
});

// ─── Merge ────────────────────────────────────────────────────────────────────

describe('a minted session still merges into the account on login', () => {
  it('folds the guest cart in and then empties the guest bucket', async () => {
    const guest = await addItem({});
    const session = guest.headers['X-Cart-Session'];

    const merged = await call(controller.mergeCart, {
      headers: { 'x-user-id': 'user-99' },
      body: { sessionId: session },
    });

    expect(merged.body.data.items).toHaveLength(1);
    expect(merged.body.data.items[0].productId).toBe('p-1');

    // Cleared, so a later logout/login cycle cannot re-merge stale items.
    const after = await getCart({ 'x-cart-session': session });
    expect(after.body.data.items).toHaveLength(0);
  });

  it('refuses a merge with no authenticated user', async () => {
    const guest = await addItem({});

    // Through the route's real guard: merging is the one cart route that needs
    // a session, and `requireAuth` is what says so now.
    const res = await callGuarded(controller.mergeCart, {
      headers: {},
      body: { sessionId: guest.headers['X-Cart-Session'] },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── Identity comes from the verified assertion, not the header ───────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw x-user-id buys nothing', () => {
  const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';

  beforeEach(() => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_IDENTITY_SECRET;
  });

  it('does not hand a forged x-user-id the account’s cart', async () => {
    // Fill user-77's cart through a properly signed assertion...
    const signed = { 'x-internal-identity': signIdentity('user-77', ['ROLE_CUSTOMER']) as string };
    await addItem(signed);
    expect((await getCart(signed)).body.data.items).toHaveLength(1);

    // ...then ask for it with nothing but a hand-written header. The controller
    // used to read that header first, so this returned the real cart.
    const forged = await getCart({ 'x-user-id': 'user-77' });

    expect(forged.body.data.items).toHaveLength(0);
    // Treated as a brand-new guest instead: given its own session, not an
    // account's basket.
    expect(forged.headers['X-Cart-Session']).toBeDefined();
  });

  it('refuses a merge carrying only a forged x-user-id', async () => {
    const guest = await addItem({});

    const res = await callGuarded(controller.mergeCart, {
      headers: { 'x-user-id': 'user-77' },
      body: { sessionId: guest.headers['X-Cart-Session'] },
    });

    expect(res.statusCode).toBe(401);
  });
});
