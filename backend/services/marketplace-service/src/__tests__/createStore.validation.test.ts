/**
 * createStore.validation.test.ts
 *
 * A malformed body must not be able to kill the service.
 *
 * `createStore` took `data: any`, spread it straight into the row and had no
 * try/catch. A POST /marketplace/my-store missing `location` therefore reached
 * Prisma, which rejects it because the column is non-nullable Json — and
 * because Express 4 does not forward a throw from an async handler, that
 * rejection went unhandled and Node ended the process. One bad request took
 * marketplace-service down for every seller. Reproduced live before this fix.
 *
 * These drive the real controller with the real schema, so they check the
 * response the endpoint produces rather than a description of it.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { MemoryStoreRepository } from '../repositories/memory-marketplace.repository.js';
import { MarketplaceService } from '../services/marketplace.service.js';

const repo = new MemoryStoreRepository();
const service = new MarketplaceService(repo);

jest.unstable_mockModule('../services/marketplace.service.js', () => ({
  MarketplaceService,
  marketplaceService: service,
}));

const { createStore } = await import('../controllers/marketplace.controller.js');

/** A minimal Express double that records what the handler did. */
function makeRes() {
  const res = {
    locals: { userId: 'seller-user-1' } as Record<string, unknown>,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

/**
 * Runs the handler the way Express would, and reports what reached `next`.
 * A handler that rejects instead of calling next is the crash under test.
 */
async function invoke(body: unknown) {
  const req = { body } as Request;
  const res = makeRes();
  let forwarded: unknown = null;
  const next: NextFunction = (err?: unknown) => { forwarded = err; };

  let rejected: unknown = null;
  await (createStore as unknown as (
    r: Request, s: Response, n: NextFunction,
  ) => Promise<void>)(req, res, next).catch((err) => { rejected = err; });

  return { res, forwarded, rejected };
}

const VALID = {
  storeName: 'Kabira Home Goods',
  description: 'Kitchenware from Kampala.',
  categories: ['home'],
  location: { city: 'Kampala', country: 'Uganda' },
};

beforeEach(() => {
  repo.clear?.();
});

describe('an incomplete create-store body is refused, not fatal', () => {
  it('never rejects out of the handler — the crash path', async () => {
    const { rejected } = await invoke({ storeName: 'No Location Store', description: 'x' });

    // This is the assertion that fails without the fix: the handler's promise
    // rejected, which outside a test means the process exits.
    expect(rejected).toBeNull();
  });

  it('hands a missing location to the error middleware as a ZodError', async () => {
    const { forwarded } = await invoke({ storeName: 'No Location Store', description: 'x' });

    expect(forwarded).not.toBeNull();
    expect((forwarded as { name?: string })?.name).toBe('ZodError');
  });

  it('names the offending field so the seller can fix it', async () => {
    const { forwarded } = await invoke({ storeName: 'No Location Store', description: 'x' });

    const paths = ((forwarded as { issues?: { path: string[] }[] })?.issues ?? [])
      .map((issue) => issue.path.join('.'));
    expect(paths).toContain('location');
  });

  it('refuses a body with no storeName rather than throwing on .toLowerCase()', async () => {
    // createStore derives the slug via `data.storeName.toLowerCase()`, which is
    // a TypeError on an absent name — the same fatal path by another route.
    const { rejected, forwarded } = await invoke({ location: { city: 'Kampala', country: 'Uganda' } });

    expect(rejected).toBeNull();
    expect((forwarded as { name?: string })?.name).toBe('ZodError');
  });

  it('refuses a location that is present but empty', async () => {
    const { rejected, forwarded } = await invoke({ ...VALID, location: { city: '', country: '' } });

    expect(rejected).toBeNull();
    expect((forwarded as { name?: string })?.name).toBe('ZodError');
  });

  it('writes nothing when the body is refused', async () => {
    await invoke({ storeName: 'No Location Store', description: 'x' });

    expect(await repo.findByUser('seller-user-1')).toBeUndefined();
  });
});

describe('a complete body still opens a storefront', () => {
  it('creates the store and answers 201', async () => {
    const { res, forwarded, rejected } = await invoke(VALID);

    expect(rejected).toBeNull();
    expect(forwarded).toBeNull();
    expect(res.statusCode).toBe(201);
    expect(res.body.data.storeName).toBe('Kabira Home Goods');
  });

  it('derives the slug rather than trusting one from the body', async () => {
    const { res } = await invoke({ ...VALID, storeSlug: 'attacker-chosen-slug' });

    expect(res.body.data.storeSlug).toBe('kabira-home-goods');
  });

  it('ignores server-owned fields supplied by the caller', async () => {
    const { res } = await invoke({
      ...VALID,
      commissionRate: 0,
      verificationStatus: 'verified',
      userId: 'somebody-else',
      rating: 5,
      totalSales: 9999,
    });

    const store = res.body.data;
    // A seller must not be able to open a pre-verified, zero-commission store,
    // nor one attributed to another account.
    expect(store.commissionRate).toBe(5);
    expect(store.verificationStatus).toBe('pending');
    expect(store.userId).toBe('seller-user-1');
    expect(store.rating).toBe(0);
    expect(store.totalSales).toBe(0);
  });
});
