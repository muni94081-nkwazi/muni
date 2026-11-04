/**
 * storefront.public.test.ts
 *
 * What a shopper may see of a store.
 *
 * The public storefront endpoints returned the whole row, so anyone who opened
 * a shop page could read `commissionRate` — the cut MUNI takes from that
 * seller, a commercial term between the marketplace and the seller. They also
 * applied no status filter, so a suspended or closed store still browsed like a
 * live one from a saved link.
 *
 * These run the real controller against the in-memory repository, so they check
 * the response the endpoint actually produces rather than a description of it.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { MemoryStoreRepository } from '../repositories/memory-marketplace.repository.js';
import { MarketplaceService } from '../services/marketplace.service.js';
import type { Store } from '../models/marketplace.model.js';

const repo = new MemoryStoreRepository();
const service = new MarketplaceService(repo);

// The controller imports the service singleton; point it at the memory repo.
jest.unstable_mockModule('../services/marketplace.service.js', () => ({
  MarketplaceService,
  marketplaceService: service,
}));

const { getStoreBySlug, getStores } = await import('../controllers/marketplace.controller.js');

const storeFixture = (over: Partial<Store> = {}): Store => ({
  id: 'store-1',
  userId: 'seller-user-1',
  storeName: 'Kampala Crafts Collective',
  storeSlug: 'kampala-crafts',
  description: 'Handwoven baskets.',
  logo: null,
  banner: null,
  categories: ['Home'],
  location: { city: 'Kampala', country: 'UG' },
  rating: 4.2,
  reviewCount: 37,
  totalSales: 120,
  commissionRate: 7.5,
  status: 'ACTIVE',
  verificationStatus: 'verified',
  joinedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
} as Store);

/** Minimal express doubles that record what the handler answered. */
function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

const reqFor = (slug: string) => ({ params: { slug } } as unknown as Request);

beforeEach(async () => {
  // Fresh repository per test.
  (service as unknown as { repo: MemoryStoreRepository }).repo = new MemoryStoreRepository();
});

async function seed(store: Store) {
  await (service as unknown as { repo: MemoryStoreRepository }).repo.create(store);
}

describe('a public storefront exposes only public fields', () => {
  it('returns the store a shopper needs', async () => {
    await seed(storeFixture());
    const res = makeRes();

    await getStoreBySlug(reqFor('kampala-crafts'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({
      storeName: 'Kampala Crafts Collective',
      storeSlug: 'kampala-crafts',
      description: 'Handwoven baskets.',
      rating: 4.2,
      reviewCount: 37,
    });
  });

  it('never returns the seller’s commission rate', async () => {
    await seed(storeFixture({ commissionRate: 7.5 } as Partial<Store>));
    const res = makeRes();

    await getStoreBySlug(reqFor('kampala-crafts'), res);

    expect(res.body.data).not.toHaveProperty('commissionRate');
    expect(JSON.stringify(res.body)).not.toContain('7.5');
  });

  it('does not leak the internal status field', async () => {
    await seed(storeFixture());
    const res = makeRes();

    await getStoreBySlug(reqFor('kampala-crafts'), res);

    expect(res.body.data).not.toHaveProperty('status');
  });

  it('keeps userId, which the storefront needs to fetch the catalogue', async () => {
    // Not a disclosure: product-service already returns sellerId on every
    // public product, and the shop page needs it to ask for that seller's list.
    await seed(storeFixture());
    const res = makeRes();

    await getStoreBySlug(reqFor('kampala-crafts'), res);

    expect(res.body.data.userId).toBe('seller-user-1');
  });

  it('resolves by id as well as slug', async () => {
    await seed(storeFixture());
    const res = makeRes();

    await getStoreBySlug(reqFor('store-1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.storeSlug).toBe('kampala-crafts');
  });
});

describe('only a trading store is publicly visible', () => {
  it('404s a suspended store instead of serving it', async () => {
    await seed(storeFixture({ status: 'SUSPENDED' } as Partial<Store>));
    const res = makeRes();

    await getStoreBySlug(reqFor('kampala-crafts'), res);

    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Kampala Crafts Collective');
  });

  it('404s an unknown slug', async () => {
    const res = makeRes();

    await getStoreBySlug(reqFor('no-such-store'), res);

    expect(res.statusCode).toBe(404);
  });

  it('answers a suspended store exactly like an unknown one', async () => {
    // Otherwise the difference confirms that a suspended store exists.
    await seed(storeFixture({ status: 'SUSPENDED' } as Partial<Store>));
    const suspended = makeRes();
    const unknown = makeRes();

    await getStoreBySlug(reqFor('kampala-crafts'), suspended);
    await getStoreBySlug(reqFor('no-such-store'), unknown);

    expect(suspended.statusCode).toBe(unknown.statusCode);
    expect(suspended.body).toEqual(unknown.body);
  });

  it('omits non-trading stores from the public directory', async () => {
    await seed(storeFixture());
    await seed(storeFixture({ id: 'store-2', storeSlug: 'closed-shop', storeName: 'Closed Shop', status: 'SUSPENDED' } as Partial<Store>));
    const res = makeRes();

    await getStores({} as Request, res);

    const names = (res.body.data as Array<{ storeName: string }>).map((s) => s.storeName);
    expect(names).toEqual(['Kampala Crafts Collective']);
  });

  it('strips commission from every store in the directory', async () => {
    await seed(storeFixture());
    const res = makeRes();

    await getStores({} as Request, res);

    expect(JSON.stringify(res.body)).not.toContain('commissionRate');
  });
});
