/**
 * Search index synchronisation.
 *
 * The `muni-products` index has exactly one writer — this service — and one
 * write per lifecycle event. There is no event stream feeding it and nothing
 * that expires a document, so a code path that forgets to write leaves the
 * index wrong until somebody rebuilds it by hand.
 *
 * Two bugs these assertions pin down:
 *
 *   • Only moderation ever wrote the index, so a product was indexed once at
 *     approval and then frozen. A seller could correct a price, a name or a
 *     description and search would keep serving the old copy indefinitely.
 *
 *   • product-service wrote `basePrice`/`averageRating`/`categorySlug` while
 *     search-service created the index with `price`/`rating`/`category`.
 *     Whichever service booted first won the mapping, and the other's documents
 *     and queries then referred to fields the index did not have.
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
};

jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

// ── Mock the Elasticsearch client layer ───────────────────────────────────────
const indexProduct           = jest.fn<(...args: any[]) => any>(async () => undefined);
const deleteProductFromIndex = jest.fn<(...args: any[]) => any>(async () => undefined);
const ensureIndex            = jest.fn<(...args: any[]) => any>(async () => undefined);

jest.unstable_mockModule('../services/search.service.js', () => ({
  indexProduct,
  deleteProductFromIndex,
  ensureIndex,
  searchProducts: jest.fn<(...args: any[]) => any>(),
}));

jest.unstable_mockModule('../../../../shared/cache/protected-cache.js', () => ({
  cached:            (_key: string, _ttl: number, loader: () => any) => loader(),
  entityVersion:     async () => 1,
  bumpEntityVersion: jest.fn<(...args: any[]) => any>(async () => undefined),
  CACHE_TTL:         { PRODUCT_DETAIL: 300 },
}));

const { updateProduct, moderateProduct, reindexAllProducts } =
  await import('../services/product.service.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function variant(over: Record<string, any> = {}) {
  return { id: 'v1', stock: 10, reserved: 0, lowStockThreshold: 5, active: true, ...over };
}

function productRow(overrides: Record<string, any> = {}) {
  return {
    id:              'p1',
    name:            'Kasese Pure Honey 1L',
    slug:            'kasese-pure-honey-1l',
    description:     'Pure natural honey',
    sellerId:        'seller-1',
    categoryId:      'cat-1',
    status:          'ACTIVE',
    basePrice:       35_000,
    compareAtPrice:  null,
    currency:        'UGX',
    brand:           null,
    tags:            [],
    images:          [],
    averageRating:   4.5,
    reviewCount:     12,
    viewCount:       0,
    rejectionReason: null,
    moderatedAt:     null,
    moderatedBy:     null,
    submittedAt:     null,
    createdAt:       new Date('2026-08-01T00:00:00Z'),
    updatedAt:       new Date('2026-08-02T00:00:00Z'),
    category:        { id: 'cat-1', name: 'Food', slug: 'food', path: 'food' },
    variants:        [variant()],
    reviews:         [],
    ...overrides,
  };
}

/** The document handed to indexProduct on the most recent call. */
function lastDocument(): any {
  return (indexProduct.mock.calls[indexProduct.mock.calls.length - 1] as any[])[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg));
  mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
    productRow({ status: 'ACTIVE', sellerId: 'seller-1' }),
  );
});

// ── The document ──────────────────────────────────────────────────────────────

describe('the indexed document', () => {
  beforeEach(() => {
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));
  });

  it('uses the canonical field names, not the database column names', async () => {
    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    const doc = lastDocument();
    expect(doc.price).toBe(35_000);
    expect(doc.rating).toBe(4.5);
    // The names search-service's query builder does NOT read.
    expect(doc).not.toHaveProperty('basePrice');
    expect(doc).not.toHaveProperty('averageRating');
    expect(doc).not.toHaveProperty('categorySlug');
  });

  it('nests category so a facet can show a name without a second lookup', async () => {
    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    expect(lastDocument().category).toEqual({
      id: 'cat-1', slug: 'food', name: 'Food', path: 'food',
    });
  });

  it('carries an embedding field, so enabling vector search needs no reindex', async () => {
    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    // Adding a field to a live index is cheap; changing an existing field's
    // type is not.
    expect(lastDocument()).toHaveProperty('embedding');
  });
});

// ── Stock ─────────────────────────────────────────────────────────────────────

describe('stock in the index', () => {
  it('counts sellable units net of reservations, not shelf units', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ variants: [variant({ stock: 10, reserved: 4 })] }),
    );

    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    // Units held by an in-flight cart cannot be sold twice.
    expect(lastDocument().stock).toBe(6);
    expect(lastDocument().inStock).toBe(true);
    expect(lastDocument().stockStatus).toBe('in_stock');
  });

  it('sums across every variant', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ variants: [variant({ stock: 3 }), variant({ id: 'v2', stock: 7 })] }),
    );

    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    expect(lastDocument().stock).toBe(10);
  });

  it('is out_of_stock when every unit is reserved', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ variants: [variant({ stock: 3, reserved: 3 })] }),
    );

    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    expect(lastDocument().stock).toBe(0);
    expect(lastDocument().inStock).toBe(false);
    expect(lastDocument().stockStatus).toBe('out_of_stock');
  });

  it('is out_of_stock for a product with no variants at all', async () => {
    mockPrisma.product.update.mockResolvedValue(productRow({ variants: [] }));

    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    expect(lastDocument().inStock).toBe(false);
  });

  it('is low_stock at or below the threshold', async () => {
    mockPrisma.product.update.mockResolvedValue(
      productRow({ variants: [variant({ stock: 5, reserved: 0, lowStockThreshold: 5 })] }),
    );

    await moderateProduct('p1', 'admin-1', { action: 'approve' } as any);

    expect(lastDocument().stockStatus).toBe('low_stock');
  });
});

// ── When the index is written ─────────────────────────────────────────────────

describe('when the index is written', () => {
  it('re-indexes an ACTIVE product after an ordinary edit', async () => {
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));

    await updateProduct('p1', 'seller-1', { tags: ['honey'] } as any);

    // The frozen-index bug: before this, only moderation wrote the index.
    expect(indexProduct).toHaveBeenCalledTimes(1);
  });

  it('reflects an edited price in the re-indexed document', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ status: 'DRAFT', sellerId: 'seller-1' }),
    );
    mockPrisma.product.update.mockResolvedValue(
      productRow({ status: 'ACTIVE', basePrice: 42_000 }),
    );

    // From DRAFT, so the price change does not trigger re-moderation.
    await updateProduct('p1', 'seller-1', { basePrice: 42_000 } as any);

    expect(lastDocument().price).toBe(42_000);
  });

  it('removes rather than re-indexes when the edit sends it back for review', async () => {
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));

    // basePrice is in RE_MODERATION_FIELDS, and the product is ACTIVE.
    await updateProduct('p1', 'seller-1', { basePrice: 99_000 } as any);

    expect(deleteProductFromIndex).toHaveBeenCalledWith('p1');
    expect(indexProduct).not.toHaveBeenCalled();
  });

  it('does not index a DRAFT — it is not publicly visible', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ status: 'DRAFT', sellerId: 'seller-1' }),
    );
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'DRAFT' }));

    await updateProduct('p1', 'seller-1', { tags: ['wip'] } as any);

    expect(indexProduct).not.toHaveBeenCalled();
  });

  it('removes on rejection', async () => {
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'REJECTED' }));

    await moderateProduct('p1', 'admin-1', { action: 'reject', reason: 'Counterfeit' } as any);

    expect(deleteProductFromIndex).toHaveBeenCalledWith('p1');
    expect(indexProduct).not.toHaveBeenCalled();
  });

  it('never lets an index failure fail the seller edit', async () => {
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));
    indexProduct.mockRejectedValueOnce(new Error('Elasticsearch unreachable'));

    // A search index is not worth losing an edit over. The cost is that the
    // index falls behind silently — which is what reindexAllProducts repairs.
    await expect(
      updateProduct('p1', 'seller-1', { tags: ['x'] } as any),
    ).resolves.toBeDefined();
  });
});

// ── Rebuild ───────────────────────────────────────────────────────────────────

describe('reindexAllProducts()', () => {
  it('creates the index first, so a rebuild onto a fresh cluster works', async () => {
    mockPrisma.product.count.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);

    await reindexAllProducts();

    expect(ensureIndex).toHaveBeenCalledTimes(1);
  });

  it('indexes every ACTIVE product and reports the counts', async () => {
    mockPrisma.product.count.mockResolvedValue(2);
    mockPrisma.product.findMany.mockResolvedValueOnce([
      productRow({ id: 'p1' }),
      productRow({ id: 'p2' }),
    ]);

    const result = await reindexAllProducts();

    expect(indexProduct).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ indexed: 2, failed: 0, total: 2 });
  });

  it('only rebuilds ACTIVE listings', async () => {
    mockPrisma.product.count.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);

    await reindexAllProducts();

    const { where } = mockPrisma.product.findMany.mock.calls[0][0] as any;
    expect(where).toEqual({ status: 'ACTIVE' });
  });

  it('counts a failed document instead of abandoning the rest', async () => {
    mockPrisma.product.count.mockResolvedValue(2);
    mockPrisma.product.findMany.mockResolvedValueOnce([
      productRow({ id: 'p1' }),
      productRow({ id: 'p2' }),
    ]);
    indexProduct.mockRejectedValueOnce(new Error('mapping conflict'));

    // One bad document must not cost the other nine thousand.
    expect(await reindexAllProducts()).toEqual({ indexed: 1, failed: 1, total: 2 });
  });

  it('pages with a cursor rather than skip', async () => {
    mockPrisma.product.count.mockResolvedValue(3);
    mockPrisma.product.findMany
      .mockResolvedValueOnce([productRow({ id: 'p1' }), productRow({ id: 'p2' })])
      .mockResolvedValueOnce([productRow({ id: 'p3' })]);

    const result = await reindexAllProducts({ batchSize: 2 });

    expect(result.indexed).toBe(3);
    // skip/take re-scans everything it skips, so the last page of a large
    // catalogue would cost the most.
    const secondPage = mockPrisma.product.findMany.mock.calls[1][0] as any;
    expect(secondPage.cursor).toEqual({ id: 'p2' });
    expect(secondPage.skip).toBe(1);
  });

  it('stops on a short page rather than issuing an extra empty query', async () => {
    mockPrisma.product.count.mockResolvedValue(1);
    mockPrisma.product.findMany.mockResolvedValueOnce([productRow({ id: 'p1' })]);

    await reindexAllProducts({ batchSize: 200 });

    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1);
  });
});
