/**
 * Seller inventory scoping — who may see and edit which stock.
 *
 * The bug: `listInventory` and `lowStockAlerts` selected on `active: true` with
 * no seller filter, so one seller's stock page returned every variant on the
 * platform — competitors' SKUs, stock levels and reservation counts. Worse,
 * `restock` was keyed on `req.params.variantId` alone, so any signed-in seller
 * could PUT a stock level onto ANY variant: `{ "stock": 0 }` against a rival's
 * variant id takes their listing off the storefront.
 *
 * Three of the five seller routes had no requireAuth at all.
 *
 * Two layers are tested here:
 *
 *   1. The scope helpers as pure functions — what filter does a seller get,
 *      what does an admin get, who may touch a given variant.
 *   2. The same helpers composed with the REAL requireAuth over HTTP, wired the
 *      way index.ts wires them, so "unauthenticated → 401" and "seller A sees
 *      only A's rows" are exercised end to end rather than asserted about.
 *
 * index.ts itself cannot be imported — it calls start() at module scope,
 * connecting Prisma and binding a port — which is why the scope logic lives in
 * its own module. Same reasoning as routes/paths.ts.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';

process.env.JWT_ACCESS_SECRET  = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
// Left UNSET on purpose: with no INTERNAL_IDENTITY_SECRET the shared middleware
// runs in header mode, which is the mode a service falls back to when the
// gateway's signed assertion is not configured. If scoping held only in signed
// mode, the fallback would be the hole.
delete process.env.INTERNAL_IDENTITY_SECRET;

const { isAdmin, ownCatalogueFilter, maySee } = await import('../auth/scope.js');
const { requireAuth } = await import('../../../../shared/http/service-auth.middleware.js');

/** A stand-in for the Response requireAuth would have populated. */
function localsFor(userId?: string, roles: string[] = []) {
  return { locals: { userId, roles } };
}

const SELLER_A = 'seller-aaa';
const SELLER_B = 'seller-bbb';

function variantOf(sellerId: string | null) {
  return { id: 'v1', sku: 'SKU-1', product: { sellerId } };
}

// ── The helpers ───────────────────────────────────────────────────────────────

describe('isAdmin', () => {
  it('is true for ROLE_ADMIN and ROLE_SUPER_ADMIN', () => {
    expect(isAdmin(localsFor('u', ['ROLE_ADMIN']))).toBe(true);
    expect(isAdmin(localsFor('u', ['ROLE_SUPER_ADMIN']))).toBe(true);
  });

  it('is false for a seller — a seller is not an admin', () => {
    expect(isAdmin(localsFor(SELLER_A, ['ROLE_SELLER']))).toBe(false);
  });

  it('is false when roles are missing or malformed', () => {
    expect(isAdmin(localsFor(SELLER_A))).toBe(false);
    expect(isAdmin({ locals: { userId: SELLER_A, roles: 'ROLE_ADMIN' } })).toBe(false);
  });
});

describe('ownCatalogueFilter', () => {
  it('restricts a seller to their own products', () => {
    expect(ownCatalogueFilter(localsFor(SELLER_A, ['ROLE_SELLER'])))
      .toEqual({ product: { sellerId: SELLER_A } });
  });

  it('does not restrict an admin', () => {
    // The admin panel's stock views run through these same routes.
    expect(ownCatalogueFilter(localsFor('admin-1', ['ROLE_ADMIN']))).toEqual({});
  });

  it('matches nothing when identity is absent, rather than everything', () => {
    // requireAuth guarantees a userId, so this is unreachable through the
    // routes. It matters anyway: an empty filter would silently mean "the whole
    // platform", which is exactly the unscoped query being replaced. Fail
    // closed, not open.
    const filter = ownCatalogueFilter(localsFor(undefined, ['ROLE_SELLER']));
    expect(filter).not.toEqual({});
    expect(filter.product?.sellerId).not.toBe(undefined);
  });

  it('is a query filter, not a post-fetch filter', () => {
    // Shape matters: it has to be spreadable into a Prisma `where`. Filtering
    // after the fetch would still pull every seller's rows into the process.
    const where = { active: true, ...ownCatalogueFilter(localsFor(SELLER_A, ['ROLE_SELLER'])) };
    expect(where).toEqual({ active: true, product: { sellerId: SELLER_A } });
  });
});

describe('maySee', () => {
  it('lets a seller act on their own variant', () => {
    expect(maySee(localsFor(SELLER_A, ['ROLE_SELLER']), variantOf(SELLER_A))).toBe(true);
  });

  it('refuses a seller another seller’s variant', () => {
    expect(maySee(localsFor(SELLER_A, ['ROLE_SELLER']), variantOf(SELLER_B))).toBe(false);
  });

  it('lets an admin act on any variant', () => {
    expect(maySee(localsFor('admin-1', ['ROLE_ADMIN']), variantOf(SELLER_B))).toBe(true);
  });

  it('refuses a missing variant without throwing', () => {
    expect(maySee(localsFor(SELLER_A, ['ROLE_SELLER']), null)).toBe(false);
    expect(maySee(localsFor(SELLER_A, ['ROLE_SELLER']), undefined)).toBe(false);
  });

  it('refuses an orphaned variant whose product has no seller', () => {
    expect(maySee(localsFor(SELLER_A, ['ROLE_SELLER']), variantOf(null))).toBe(false);
  });

  it('refuses when identity is absent', () => {
    expect(maySee(localsFor(undefined, []), variantOf(SELLER_A))).toBe(false);
  });
});

// ── Composed with the real requireAuth, over HTTP ─────────────────────────────

/**
 * Every variant in the fake catalogue. Two sellers, so "A sees only A's" is a
 * claim the fixture can actually falsify.
 */
const CATALOGUE = [
  { id: 'v-a1', sku: 'A-1', stock: 10, reserved: 0, lowStockThreshold: 5, active: true, product: { id: 'p-a1', name: 'A one', sellerId: SELLER_A } },
  { id: 'v-a2', sku: 'A-2', stock:  3, reserved: 0, lowStockThreshold: 5, active: true, product: { id: 'p-a2', name: 'A two', sellerId: SELLER_A } },
  { id: 'v-b1', sku: 'B-1', stock: 99, reserved: 0, lowStockThreshold: 5, active: true, product: { id: 'p-b1', name: 'B one', sellerId: SELLER_B } },
];

/** Applies the `where` the handler built, the way Prisma would. */
const findMany = jest.fn(async ({ where }: any) => {
  const wanted = where?.product?.sellerId;
  return CATALOGUE.filter((v) => wanted === undefined || v.product.sellerId === wanted);
});

/**
 * The list route as index.ts composes it: requireAuth, then a handler that
 * builds its `where` from ownCatalogueFilter.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/v1/seller/inventory', requireAuth, async (_req, res) => {
    const variants = await findMany({
      where: { active: true, ...ownCatalogueFilter(res) },
    });
    res.json({ success: true, data: variants, meta: { total: variants.length } });
  });
  return app;
}

const app = buildApp();

interface ListBody {
  success: boolean;
  data: Array<{ id: string; sku: string; product: { sellerId: string } }>;
  meta: { total: number };
}

async function get(
  headers: Record<string, string> = {},
): Promise<{ status: number; body: ListBody }> {
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/seller/inventory`, { headers });
    const body = (await res.json().catch(() => null)) as ListBody;
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

const asSeller = (id: string) => ({ 'x-user-id': id, 'x-user-roles': 'ROLE_SELLER' });
const asAdmin  = () => ({ 'x-user-id': 'admin-1', 'x-user-roles': 'ROLE_ADMIN' });

beforeEach(() => { findMany.mockClear(); });

describe('GET /api/v1/seller/inventory', () => {
  it('returns 401 to an unauthenticated caller', async () => {
    const { status } = await get();

    // This route had NO requireAuth at all, and returned the whole platform's
    // stock to anyone who could reach the service.
    expect(status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns only seller A’s variants to seller A', async () => {
    const { status, body } = await get(asSeller(SELLER_A));

    expect(status).toBe(200);
    expect(body.data.map((v) => v.id)).toEqual(['v-a1', 'v-a2']);
  });

  it('does not leak seller B’s rows to seller A', async () => {
    const { body } = await get(asSeller(SELLER_A));

    const sellers = new Set(body.data.map((v) => v.product.sellerId));
    expect(sellers).toEqual(new Set([SELLER_A]));
    // The specific row that used to come back.
    expect(JSON.stringify(body.data)).not.toContain('B-1');
  });

  it('returns only seller B’s variants to seller B', async () => {
    const { body } = await get(asSeller(SELLER_B));

    expect(body.data.map((v) => v.id)).toEqual(['v-b1']);
  });

  it('pushes the seller filter into the query, not into a post-filter', async () => {
    await get(asSeller(SELLER_A));

    expect((findMany.mock.calls[0][0] as any).where).toEqual({
      active: true,
      product: { sellerId: SELLER_A },
    });
  });

  it('returns every variant to an admin', async () => {
    const { status, body } = await get(asAdmin());

    expect(status).toBe(200);
    expect(body.data).toHaveLength(3);
  });

  it('returns 200 and an empty array for a seller with no stock', async () => {
    // A new seller having nothing is an ordinary state, not an error — the UI
    // renders its own empty state from a 200.
    const { status, body } = await get(asSeller('seller-with-nothing'));

    expect(status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('does not treat a forged role header as admin without a user id', async () => {
    const { status } = await get({ 'x-user-roles': 'ROLE_ADMIN' });

    // requireAuth needs an identity, not just a claim about one. The gateway
    // strips both headers from inbound requests before re-stamping them.
    expect(status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});
