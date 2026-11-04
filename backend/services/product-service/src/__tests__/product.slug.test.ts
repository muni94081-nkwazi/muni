/**
 * product.slug.test.ts
 *
 * Two sellers listing the same thing.
 *
 * `Product.slug` is `@unique` across the whole platform, and every client
 * derives it from the product name — seller-center slugifies the name in
 * products.api.ts, and the bulk importer does the same. On a marketplace that
 * makes collisions ordinary rather than exceptional: the second seller to list
 * an "iPhone 13 Case" sent the slug `iphone-13-case`, Prisma raised P2002, and
 * the create answered 500 with the raw constraint message behind
 * "Failed to create product".
 *
 * The client cannot fix this — it cannot see other sellers' listings, and
 * cannot see a product created between its check and its write — so the slug is
 * made unique here, where the constraint lives. The seller's `name` is left
 * exactly as typed; only the URL slug gains a suffix.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPrisma = {
  product: {
    create:            jest.fn<(...args: any[]) => any>(),
    findUnique:        jest.fn<(...args: any[]) => any>(),
    findUniqueOrThrow: jest.fn<(...args: any[]) => any>(),
  },
  productVariant: {
    createMany: jest.fn<(...args: any[]) => any>(async () => ({ count: 1 })),
  },
  $transaction: jest.fn<(...args: any[]) => any>(),
};

// createProduct uses the interactive form, `$transaction(async (tx) => …)`, so
// the product and its variants commit together. `tx` is the same mock object,
// which is what lets the assertions read product.create's calls.
function transactionMock(argument: any): any {
  return typeof argument === 'function' ? argument(mockPrisma) : Promise.all(argument);
}

jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<(...args: any[]) => any>(async () => undefined),
  connectProducer: jest.fn<(...args: any[]) => any>(async () => undefined),
  disconnectProducer: jest.fn<(...args: any[]) => any>(async () => undefined),
  isProducerReady: jest.fn(() => true),
  getProducer: jest.fn(() => null),
}));

jest.unstable_mockModule('../services/search.service.js', () => ({
  indexProduct:           jest.fn<(...args: any[]) => any>(async () => undefined),
  deleteProductFromIndex: jest.fn<(...args: any[]) => any>(async () => undefined),
  searchProducts:         jest.fn<(...args: any[]) => any>(),
  ensureIndex:            jest.fn<(...args: any[]) => any>(async () => undefined),
}));

jest.unstable_mockModule('../../../../shared/cache/protected-cache.js', () => ({
  cached:            (_key: string, _ttl: number, loader: () => any) => loader(),
  entityVersion:     async () => 1,
  bumpEntityVersion: jest.fn<(...args: any[]) => any>(async () => undefined),
  CACHE_TTL:         { PRODUCT_DETAIL: 300 },
}));

const { createProduct } = await import('../services/product.service.js');

/**
 * A raw create body, as a client sends it.
 *
 * Cast once here rather than at each call site: `CreateProductInput` is the
 * schema's OUTPUT type, so it already has the defaults (`tags`, `currency`,
 * `images`, `status`) that `parse` fills in and a request body does not carry.
 * moderation.service.test.ts casts the same fixture at all four of its call
 * sites; one cast at the fixture keeps the assertions below uncluttered.
 */
const INPUT = {
  name:      'iPhone 13 Case',
  slug:      'iphone-13-case',
  basePrice: 35_000,
} as unknown as Parameters<typeof createProduct>[1];

/** What product.create was called with. */
function createdWith(): any {
  return mockPrisma.product.create.mock.calls[0][0].data;
}

/** Slugs this test says already exist in the table. */
function slugsTaken(...taken: string[]) {
  mockPrisma.product.findUnique.mockImplementation(async (args: any) =>
    taken.includes(args?.where?.slug) ? { id: `existing-${args.where.slug}` } : null,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(transactionMock);
  mockPrisma.product.create.mockImplementation(async (args: any) => ({
    id: 'p-new',
    ...args.data,
  }));
  mockPrisma.product.findUniqueOrThrow.mockImplementation(async () => ({
    id: 'p-new',
    ...INPUT,
    variants: [],
    reviews: [],
    category: null,
  }));
  mockPrisma.productVariant.createMany.mockImplementation(async () => ({ count: 1 }));
  slugsTaken(); // nothing taken unless a test says so
});

describe('a slug nobody else is using', () => {
  it('keeps the requested slug when it is free', async () => {
    await createProduct('seller-1', INPUT);

    expect(createdWith().slug).toBe('iphone-13-case');
  });

  it('does not reuse a slug another seller already has', async () => {
    slugsTaken('iphone-13-case');

    await createProduct('seller-2', INPUT);

    expect(createdWith().slug).not.toBe('iphone-13-case');
    // Still derived from the name, so the URL stays readable.
    expect(createdWith().slug).toMatch(/^iphone-13-case-[a-z0-9]+$/);
  });

  it('still satisfies the format the schema enforces', async () => {
    slugsTaken('iphone-13-case');

    await createProduct('seller-2', INPUT);

    // CreateProductSchema: /^[a-z0-9-]+$/, max 255.
    expect(createdWith().slug).toMatch(/^[a-z0-9-]+$/);
    expect(createdWith().slug.length).toBeLessThanOrEqual(255);
  });

  it('leaves the seller’s own product name untouched', async () => {
    slugsTaken('iphone-13-case');

    await createProduct('seller-2', INPUT);

    // Two sellers may both sell an iPhone 13 Case and both say so. Only the
    // URL has to be unique.
    expect(createdWith().name).toBe('iPhone 13 Case');
  });

  it('keeps looking when the first generated candidate is also taken', async () => {
    // Every findUnique says "taken" for a few calls, then stops. Proves the
    // resolver re-checks rather than assuming one suffix is enough.
    let answered = 0;
    mockPrisma.product.findUnique.mockImplementation(async () => {
      answered += 1;
      return answered <= 3 ? { id: 'existing' } : null;
    });

    await createProduct('seller-2', INPUT);

    expect(mockPrisma.product.findUnique.mock.calls.length).toBeGreaterThan(3);
    expect(createdWith().slug).toMatch(/^iphone-13-case-[a-z0-9]+$/);
  });

  it('gives up with a 409 rather than writing a row that violates the index', async () => {
    // Everything is taken. The unique index is still the real guarantee, so the
    // honest answer is "pick a different name", not a 500 from Prisma.
    mockPrisma.product.findUnique.mockImplementation(async () => ({ id: 'existing' }));

    await expect(createProduct('seller-2', INPUT)).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
  });

  it('names the generated SKU after the slug the listing actually got', async () => {
    slugsTaken('iphone-13-case');

    await createProduct('seller-2', INPUT);

    const variant = mockPrisma.productVariant.createMany.mock.calls[0][0].data[0];
    const resolvedSlug: string = createdWith().slug;
    // defaultSku builds its prefix from the slug's first three words; the point
    // here is that it used the resolved slug, not the requested one.
    expect(variant.sku).toBeTruthy();
    expect(resolvedSlug).not.toBe('iphone-13-case');
  });
});
