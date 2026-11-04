/**
 * Trending, delete-side index cleanup, and the price event.
 *
 * Three gaps this covers:
 *
 *   • `GET /products/trending` was wired to `list()` with no parameters. The
 *     comment beside the route claimed "list() handles sort=newest"; it did not
 *     even do that — no `sort` is passed, so the schema defaults to `relevance`,
 *     which with no `q` falls through to `createdAt desc`. "Trending" meant
 *     "most recently added", so a listing nobody had opened outranked the thing
 *     the whole country was buying.
 *
 *   • `deleteProduct` archives a listing. Nothing asserted that it also leaves
 *     the search index, which is what stops an archived product still being
 *     findable.
 *
 *   • wishlist-service consumes `price.updated` on product-events and had never
 *     received one, because nothing published to the topic. Its handler and its
 *     price-drop alert were complete and idle.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mock Prisma ───────────────────────────────────────────────────────────────
const mockPrisma = {
  product: {
    create:            jest.fn<(...args: any[]) => any>(),
    update:            jest.fn<(...args: any[]) => any>(),
    findUnique:        jest.fn<(...args: any[]) => any>(),
    findUniqueOrThrow: jest.fn<(...args: any[]) => any>(),
    findFirst:         jest.fn<(...args: any[]) => any>(),
    findMany:          jest.fn<(...args: any[]) => any>(),
    count:             jest.fn<(...args: any[]) => any>(),
    groupBy:           jest.fn<(...args: any[]) => any>(),
  },
  category:       { findFirst: jest.fn<(...args: any[]) => any>() },
  productVariant: { createMany: jest.fn<(...args: any[]) => any>(async () => ({ count: 1 })) },
  $transaction:   jest.fn<(...args: any[]) => any>(),
  $queryRaw:      jest.fn<(...args: any[]) => any>(),
};

jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

const indexProduct           = jest.fn<(...args: any[]) => any>(async () => undefined);
const deleteProductFromIndex = jest.fn<(...args: any[]) => any>(async () => undefined);

jest.unstable_mockModule('../services/search.service.js', () => ({
  indexProduct,
  deleteProductFromIndex,
  ensureIndex:    jest.fn<(...args: any[]) => any>(async () => undefined),
  searchProducts: jest.fn<(...args: any[]) => any>(),
}));

// The Kafka producer, so a publish can be asserted without a broker.
const publish = jest.fn<(...args: any[]) => any>(async () => undefined);

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish,
  connectProducer:    jest.fn<(...args: any[]) => any>(async () => undefined),
  disconnectProducer: jest.fn<(...args: any[]) => any>(async () => undefined),
  isProducerReady:    () => true,
  getProducer:        () => null,
}));

jest.unstable_mockModule('../../../../shared/cache/protected-cache.js', () => ({
  cached:            (_key: string, _ttl: number, loader: () => any) => loader(),
  entityVersion:     async () => 1,
  bumpEntityVersion: jest.fn<(...args: any[]) => any>(async () => undefined),
  CACHE_TTL:         { PRODUCT_DETAIL: 300 },
}));

const { getTrendingProducts, deleteProduct, updateProduct, moderateProduct, TRENDING_LIMIT } =
  await import('../services/product.service.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function productRow(overrides: Record<string, any> = {}) {
  return {
    id: 'p1', name: 'Kasese Pure Honey 1L', slug: 'kasese-pure-honey-1l',
    description: 'Pure natural honey', sellerId: 'seller-1', categoryId: 'cat-1',
    status: 'ACTIVE', basePrice: 35_000, compareAtPrice: null, currency: 'UGX',
    brand: null, tags: [], images: [], averageRating: 4.5, reviewCount: 12,
    viewCount: 900, rejectionReason: null, moderatedAt: null, moderatedBy: null,
    submittedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-02T00:00:00Z'),
    category: { id: 'cat-1', name: 'Food', slug: 'food', path: 'food' },
    variants: [{ id: 'v1', stock: 10, reserved: 0, lowStockThreshold: 5, active: true }],
    reviews: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg));
});

// ── Trending ──────────────────────────────────────────────────────────────────

describe('getTrendingProducts()', () => {
  it('ranks by a scored query, not by createdAt', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'p1' }]);
    mockPrisma.product.findMany.mockResolvedValue([productRow()]);

    await getTrendingProducts();

    // The whole point: a raw scored query rather than an orderBy on a column.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (mockPrisma.$queryRaw.mock.calls[0][0] as string[]).join('');
    expect(sql).toContain('viewCount');
    expect(sql).toContain('reviewCount');
    expect(sql).toContain('averageRating');
  });

  it('decays by age, so trending means now rather than all-time', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await getTrendingProducts();

    const sql = (mockPrisma.$queryRaw.mock.calls[0][0] as string[]).join('');
    // Without a recency term this is a popularity chart: a product that was
    // huge last year would sit at the top forever.
    expect(sql).toContain('POWER');
    expect(sql).toContain('createdAt');
  });

  it('only considers ACTIVE listings', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await getTrendingProducts();

    const sql = (mockPrisma.$queryRaw.mock.calls[0][0] as string[]).join('');
    expect(sql).toContain("status = 'ACTIVE'");
  });

  it('queries the quoted PascalCase table Prisma actually created', async () => {
    // Caught only by running against a real database: this schema declares no
    // `@@map`, so the table is `"Product"`. The query said `FROM products`,
    // which Postgres answers with `relation "products" does not exist` — and a
    // mocked $queryRaw returns whatever it is told regardless of the SQL, so
    // every other assertion here passed while the endpoint was broken.
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await getTrendingProducts();

    const sql = (mockPrisma.$queryRaw.mock.calls[0][0] as string[]).join('');
    expect(sql).toContain('FROM "Product"');
    expect(sql).not.toMatch(/FROM\s+products/i);
  });

  it('caps at 20 however many the caller asks for', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await getTrendingProducts(5000);

    // The limit is interpolated as a bound parameter, so it is an argument
    // rather than part of the SQL string.
    expect(mockPrisma.$queryRaw.mock.calls[0]).toContain(TRENDING_LIMIT);
    expect(TRENDING_LIMIT).toBe(20);
  });

  it('honours a smaller limit', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await getTrendingProducts(5);

    expect(mockPrisma.$queryRaw.mock.calls[0]).toContain(5);
  });

  it('falls back to the cap for a nonsensical limit', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await getTrendingProducts(0);

    expect(mockPrisma.$queryRaw.mock.calls[0]).toContain(TRENDING_LIMIT);
  });

  it('preserves the scored order that Postgres IN() would discard', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'p3' }, { id: 'p1' }, { id: 'p2' }]);
    // findMany returns them in a different order, as an IN() genuinely can.
    mockPrisma.product.findMany.mockResolvedValue([
      productRow({ id: 'p1' }), productRow({ id: 'p2' }), productRow({ id: 'p3' }),
    ]);

    const result = await getTrendingProducts();

    expect(result.data.map((p: any) => p.id)).toEqual(['p3', 'p1', 'p2']);
  });

  it('returns an empty result without a second query when nothing scores', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await getTrendingProducts();

    expect(result).toEqual({ data: [], meta: { total: 0, limit: TRENDING_LIMIT } });
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
  });

  it('drops an id that vanished between the two queries', async () => {
    // A product archived in the gap must not become a hole in the response.
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'p1' }, { id: 'gone' }]);
    mockPrisma.product.findMany.mockResolvedValue([productRow({ id: 'p1' })]);

    const result = await getTrendingProducts();

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });
});

// ── deleteProduct ─────────────────────────────────────────────────────────────

describe('deleteProduct()', () => {
  beforeEach(() => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ sellerId: 'seller-1' }),
    );
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ARCHIVED' }));
  });

  it('removes the product from the search index', async () => {
    await deleteProduct('p1', 'seller-1');

    // Archiving in SQL is only half of it — an archived product that stays in
    // the index is still findable, and still clickable through to a 404.
    expect(deleteProductFromIndex).toHaveBeenCalledWith('p1');
  });

  it('archives rather than hard-deleting', async () => {
    await deleteProduct('p1', 'seller-1');

    const { data } = mockPrisma.product.update.mock.calls[0][0] as any;
    expect(data).toEqual({ status: 'ARCHIVED' });
  });

  it('refuses another seller’s product, and touches neither store', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ sellerId: 'someone-else' }),
    );

    await expect(deleteProduct('p1', 'seller-1')).rejects.toMatchObject({ status: 403 });

    expect(mockPrisma.product.update).not.toHaveBeenCalled();
    expect(deleteProductFromIndex).not.toHaveBeenCalled();
  });
});

// ── price.updated ─────────────────────────────────────────────────────────────

describe('updateProduct() — price events', () => {
  beforeEach(() => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ status: 'DRAFT', sellerId: 'seller-1', basePrice: 35_000 }),
    );
  });

  it('publishes price.updated when an ACTIVE listing’s price changes', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ status: 'ACTIVE', basePrice: 30_000 }),
    );

    await updateProduct('p1', 'seller-1', { basePrice: 30_000 } as any);

    expect(publish).toHaveBeenCalledTimes(1);
    const [topic, payload, key] = publish.mock.calls[0] as any[];
    expect(topic).toBe('product-events');
    expect(payload.type).toBe('price.updated');
    expect(payload.payload).toMatchObject({ productId: 'p1', oldPrice: 35_000, newPrice: 30_000 });
    // Keyed by product id so two rapid edits stay ordered on one partition.
    expect(key).toBe('p1');
  });

  it('does not publish when the price is unchanged', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ status: 'ACTIVE', basePrice: 35_000 }),
    );

    await updateProduct('p1', 'seller-1', { tags: ['honey'] } as any);

    // Otherwise every unrelated edit rewrites every wishlist holding it.
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not publish for a listing customers cannot see', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ status: 'DRAFT', basePrice: 30_000 }),
    );

    await updateProduct('p1', 'seller-1', { basePrice: 30_000 } as any);

    // A draft's price is not news to anyone's wishlist.
    expect(publish).not.toHaveBeenCalled();
  });

  it('never lets a broker failure fail the seller’s edit', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ status: 'ACTIVE', basePrice: 30_000 }),
    );
    publish.mockRejectedValueOnce(new Error('Kafka unreachable'));

    await expect(
      updateProduct('p1', 'seller-1', { basePrice: 30_000 } as any),
    ).resolves.toBeDefined();
  });
});

// ── price.updated on approval ─────────────────────────────────────────────────
//
// Approval is where a price becomes real to customers, and it is the ONLY path
// that can publish for a live listing. Found by running against real
// infrastructure: `basePrice` is in RE_MODERATION_FIELDS, so editing an ACTIVE
// product's price sets needsReview and the row comes back PENDING_APPROVAL,
// while updateProduct's publish requires status === 'ACTIVE'. The two are
// mutually exclusive for the exact field the event is about, so a seller
// lowering a price emitted nothing and no wishlist was ever told.
//
// The unit test for the updateProduct branch passed throughout, because it
// mocked product.update to return ACTIVE — a state the real flow cannot reach.

describe('moderateProduct() — price events', () => {
  beforeEach(() => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ status: 'PENDING_APPROVAL' }),
    );
  });

  it('publishes the current price when a listing is approved', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ status: 'ACTIVE', basePrice: 1750 }),
    );

    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    expect(publish).toHaveBeenCalledTimes(1);
    const [topic, payload, key] = publish.mock.calls[0] as any[];
    expect(topic).toBe('product-events');
    expect(payload.type).toBe('price.updated');
    // The CURRENT price, not a delta: wishlist-service compares it against its
    // own stored currentPrice per holding and decides whether that is a drop,
    // which also makes a replayed approval idempotent.
    expect(payload.payload).toMatchObject({ productId: 'p1', newPrice: 1750 });
    expect(key).toBe('p1');
  });

  it('does not publish on rejection', async () => {
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'REJECTED' }));

    await moderateProduct('p1', 'admin-1', { action: 'reject', reason: 'Counterfeit' } as any);

    expect(publish).not.toHaveBeenCalled();
  });

  it('never lets a broker failure fail the approval', async () => {
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));
    publish.mockRejectedValueOnce(new Error('Kafka unreachable'));

    await expect(
      moderateProduct('p1', 'admin-1', { action: 'approve' } as any),
    ).resolves.toBeDefined();
  });
});
