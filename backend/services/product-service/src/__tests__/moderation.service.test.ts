/**
 * Product moderation — seller submits → admin approves/rejects → customer sees.
 *
 * Covers the three places the approval gate can be defeated:
 *   • creating a listing that is ACTIVE on arrival,
 *   • editing an approved listing into something that was never reviewed,
 *   • reading an unapproved listing through the public product endpoints.
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
  category: { findFirst: jest.fn<(...args: any[]) => any>() },
  // createProduct writes the product and its variants together, so the mock has
  // to model this table as well as the interactive-transaction form below.
  productVariant: {
    createMany: jest.fn<(...args: any[]) => any>(async () => ({ count: 1 })),
  },
  $transaction: jest.fn<(...args: any[]) => any>(),
};

/**
 * Prisma's $transaction has two shapes and the service uses both:
 *
 *   $transaction([op, op])        — batched, used by the listing queries
 *   $transaction(async (tx) => …) — interactive, used by createProduct so the
 *                                   product and its variants commit together
 *
 * The mock previously only handled the array form, so every createProduct test
 * failed on `ops is not iterable` the moment creation became transactional.
 * `tx` is the same mock object, which is what lets the assertions keep reading
 * `mockPrisma.product.create.mock.calls`.
 */
function transactionMock(argument: any): any {
  return typeof argument === 'function' ? argument(mockPrisma) : Promise.all(argument);
}

jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

// The Kafka producer. Approval fires a price.updated event, and the moderation
// response must not wait for it — see the timing test at the end of this file.
const publish = jest.fn<(...args: any[]) => any>(async () => undefined);
jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish,
  connectProducer: jest.fn<(...args: any[]) => any>(async () => undefined),
  disconnectProducer: jest.fn<(...args: any[]) => any>(async () => undefined),
  isProducerReady: jest.fn(() => true),
  getProducer: jest.fn(() => null),
}));

// ── Mock Elasticsearch sync ───────────────────────────────────────────────────
const indexProduct           = jest.fn<(...args: any[]) => any>(async () => undefined);
const deleteProductFromIndex = jest.fn<(...args: any[]) => any>(async () => undefined);

const ensureIndex = jest.fn<(...args: any[]) => any>(async () => undefined);

jest.unstable_mockModule('../services/search.service.js', () => ({
  indexProduct,
  deleteProductFromIndex,
  searchProducts: jest.fn<(...args: any[]) => any>(),
  ensureIndex,
}));

// ── Mock the cache so reads hit the loader directly ───────────────────────────
jest.unstable_mockModule('../../../../shared/cache/protected-cache.js', () => ({
  cached:            (_key: string, _ttl: number, loader: () => any) => loader(),
  entityVersion:     async () => 1,
  bumpEntityVersion: jest.fn<(...args: any[]) => any>(async () => undefined),
  CACHE_TTL:         { PRODUCT_DETAIL: 300 },
}));

const {
  createProduct,
  updateProduct,
  moderateProduct,
  getProductById,
  listSellerProducts,
  listModerationQueue,
} = await import('../services/product.service.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_INPUT = {
  name:      'Kasese Pure Honey 1L',
  slug:      'kasese-pure-honey-1l',
  basePrice: 35_000,
};

/** A row as Prisma returns it, with the relations productInclude asks for. */
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
    averageRating:   0,
    reviewCount:     0,
    viewCount:       0,
    rejectionReason: null,
    moderatedAt:     null,
    moderatedBy:     null,
    submittedAt:     null,
    createdAt:       new Date('2026-08-01T00:00:00Z'),
    updatedAt:       new Date('2026-08-01T00:00:00Z'),
    category:        { id: 'cat-1', name: 'Food', slug: 'food', path: 'food' },
    variants:        [],
    reviews:         [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(transactionMock);
  mockPrisma.productVariant.createMany.mockResolvedValue({ count: 1 });
  // createProduct re-reads through productInclude after createMany, because
  // createMany returns a count rather than rows.
  mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow());
});

// ── Creation ──────────────────────────────────────────────────────────────────

describe('createProduct() — submission, not publication', () => {
  it('defaults a new listing to PENDING_APPROVAL and stamps submittedAt', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));

    await createProduct('seller-1', VALID_INPUT as any);

    const { data } = mockPrisma.product.create.mock.calls[0][0] as any;
    expect(data.status).toBe('PENDING_APPROVAL');
    expect(data.submittedAt).toBeInstanceOf(Date);
    expect(data.sellerId).toBe('seller-1');
  });

  it('refuses a seller-supplied ACTIVE status — approval is an outcome, not an input', async () => {
    await expect(
      createProduct('seller-1', { ...VALID_INPUT, status: 'ACTIVE' } as any),
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(mockPrisma.product.create).not.toHaveBeenCalled();
  });

  it('allows DRAFT, and leaves submittedAt null so drafts stay out of the queue', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow({ status: 'DRAFT' }));

    await createProduct('seller-1', { ...VALID_INPUT, status: 'DRAFT' } as any);

    const { data } = mockPrisma.product.create.mock.calls[0][0] as any;
    expect(data.status).toBe('DRAFT');
    expect(data.submittedAt).toBeNull();
  });

  it('takes the seller id from the caller, not from the request body', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', { ...VALID_INPUT, sellerId: 'seller-999' } as any);

    const { data } = mockPrisma.product.create.mock.calls[0][0] as any;
    expect(data.sellerId).toBe('seller-1');
  });
});

// ── Stock ─────────────────────────────────────────────────────────────────────
//
// Stock lives only on ProductVariant — there is no product-level stock column,
// and formatProduct derives `inStock` from `variants.some(v => v.stock -
// v.reserved > 0)`. A product created with no variants is therefore permanently
// out of stock, which is what every product created through seller-center was.
// These assertions are the guard against that regressing.

describe('createProduct() — a product is always sellable', () => {
  it('writes one default variant when the seller supplies none', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', VALID_INPUT as any);

    expect(mockPrisma.productVariant.createMany).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.productVariant.createMany.mock.calls[0][0] as any;
    expect(data).toHaveLength(1);
    expect(data[0].productId).toBe('p1');
    expect(data[0].sku).toEqual(expect.any(String));
    expect(data[0].sku.length).toBeGreaterThan(0);
  });

  it('prices the default variant from basePrice rather than leaving it null', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', VALID_INPUT as any);

    const { data } = mockPrisma.productVariant.createMany.mock.calls[0][0] as any;
    expect(data[0].price).toBe(VALID_INPUT.basePrice);
  });

  it('carries the seller-supplied sku and stock through to the variant', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', {
      ...VALID_INPUT,
      variants: [{ sku: 'HONEY-1L', stock: 42, price: 30000, attributes: { size: '1L' } }],
    } as any);

    const { data } = mockPrisma.productVariant.createMany.mock.calls[0][0] as any;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ sku: 'HONEY-1L', stock: 42, price: 30000 });
    expect(data[0].attributes).toEqual({ size: '1L' });
  });

  it('creates several variants, each with a distinct generated sku', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', {
      ...VALID_INPUT,
      variants: [
        { stock: 5, attributes: { size: '500ML' } },
        { stock: 3, attributes: { size: '1L' } },
      ],
    } as any);

    const { data } = mockPrisma.productVariant.createMany.mock.calls[0][0] as any;
    expect(data).toHaveLength(2);
    // sku is @unique platform-wide, so a collision inside one create aborts it.
    expect(data[0].sku).not.toBe(data[1].sku);
  });

  it('defaults stock to 0 rather than inventing quantity the seller never entered', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', VALID_INPUT as any);

    const { data } = mockPrisma.productVariant.createMany.mock.calls[0][0] as any;
    expect(data[0].stock).toBe(0);
  });

  it('commits the product and its variants in ONE transaction', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', VALID_INPUT as any);

    // A product that committed without its variants is the unsellable row this
    // whole change exists to stop creating.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction.mock.calls[0][0]).toEqual(expect.any(Function));
  });

  it('rejects more than 100 variants', async () => {
    await expect(
      createProduct('seller-1', {
        ...VALID_INPUT,
        variants: Array.from({ length: 101 }, (_, i) => ({ stock: 1, attributes: { n: String(i) } })),
      } as any),
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(mockPrisma.product.create).not.toHaveBeenCalled();
  });
});

// ── Editing an approved listing ───────────────────────────────────────────────

describe('updateProduct() — re-moderation on substantive edits', () => {
  it('sends an ACTIVE listing back to the queue when the name changes', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'ACTIVE' }));
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));

    await updateProduct('p1', 'seller-1', { name: 'Something Else Entirely' } as any);

    const { data } = mockPrisma.product.update.mock.calls[0][0] as any;
    expect(data.status).toBe('PENDING_APPROVAL');
    expect(data.submittedAt).toBeInstanceOf(Date);
    // A listing awaiting re-review must leave the storefront immediately.
    expect(deleteProductFromIndex).toHaveBeenCalledWith('p1');
  });

  it('re-queues on a price change', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'ACTIVE' }));
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));

    await updateProduct('p1', 'seller-1', { basePrice: 99_000 } as any);

    expect((mockPrisma.product.update.mock.calls[0][0] as any).data.status).toBe('PENDING_APPROVAL');
  });

  it('does NOT re-queue when the edit form echoes unchanged values back', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'ACTIVE' }));
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));

    await updateProduct('p1', 'seller-1', {
      name:        'Kasese Pure Honey 1L',
      description: 'Pure natural honey',
      basePrice:   35_000,
    } as any);

    const { data } = mockPrisma.product.update.mock.calls[0][0] as any;
    expect(data.status).toBeUndefined();
    expect(deleteProductFromIndex).not.toHaveBeenCalled();
  });

  it('treats an identical images array as unchanged despite a new reference', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ status: 'ACTIVE', images: ['https://cdn/a.jpg', 'https://cdn/b.jpg'] }),
    );
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));

    await updateProduct('p1', 'seller-1', {
      images: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
    } as any);

    expect((mockPrisma.product.update.mock.calls[0][0] as any).data.status).toBeUndefined();
  });

  it('leaves a DRAFT as a draft — only published or rejected listings re-queue', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'DRAFT' }));
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'DRAFT' }));

    await updateProduct('p1', 'seller-1', { name: 'New Draft Name' } as any);

    expect((mockPrisma.product.update.mock.calls[0][0] as any).data.status).toBeUndefined();
  });

  it('clears the previous rejection when a REJECTED listing is resubmitted', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(
      productRow({ status: 'REJECTED', rejectionReason: 'Counterfeit branding' }),
    );
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));

    await updateProduct('p1', 'seller-1', { name: 'Corrected Name' } as any);

    const { data } = mockPrisma.product.update.mock.calls[0][0] as any;
    expect(data.status).toBe('PENDING_APPROVAL');
    expect(data.rejectionReason).toBeNull();
    expect(data.moderatedAt).toBeNull();
  });

  it('refuses to update another seller’s product', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ sellerId: 'seller-1' }));

    await expect(
      updateProduct('p1', 'seller-2', { name: 'Hijacked' } as any),
    ).rejects.toMatchObject({ status: 403 });

    expect(mockPrisma.product.update).not.toHaveBeenCalled();
  });
});

// ── Moderation decisions ──────────────────────────────────────────────────────

describe('moderateProduct()', () => {
  it('approve publishes the listing and adds it to the search index', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));

    const result = await moderateProduct('p1', 'admin-7', { action: 'approve' } as any);

    const { data } = mockPrisma.product.update.mock.calls[0][0] as any;
    expect(data.status).toBe('ACTIVE');
    expect(data.moderatedBy).toBe('admin-7');
    expect(data.rejectionReason).toBeNull();
    expect(indexProduct).toHaveBeenCalledTimes(1);
    expect(deleteProductFromIndex).not.toHaveBeenCalled();
    expect(result.status).toBe('ACTIVE');
  });

  it('reject records the reason and removes the listing from search', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));
    mockPrisma.product.update.mockResolvedValue(
      productRow({ status: 'REJECTED', rejectionReason: 'Counterfeit branding' }),
    );

    await moderateProduct('p1', 'admin-7', { action: 'reject', reason: 'Counterfeit branding' } as any);

    const { data } = mockPrisma.product.update.mock.calls[0][0] as any;
    expect(data.status).toBe('REJECTED');
    expect(data.rejectionReason).toBe('Counterfeit branding');
    expect(deleteProductFromIndex).toHaveBeenCalledWith('p1');
    expect(indexProduct).not.toHaveBeenCalled();
  });

  it('refuses a rejection with no reason — the seller would have nothing to act on', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));

    await expect(
      moderateProduct('p1', 'admin-7', { action: 'reject' } as any),
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(mockPrisma.product.update).not.toHaveBeenCalled();
  });

  it('refuses to moderate an archived listing', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'ARCHIVED' }));

    await expect(
      moderateProduct('p1', 'admin-7', { action: 'approve' } as any),
    ).rejects.toMatchObject({ status: 409 });

    expect(mockPrisma.product.update).not.toHaveBeenCalled();
  });

  /**
   * Approval latency must not depend on the broker.
   *
   * The first approval after a restart took over 8 seconds and tripped the
   * gateway's timeout, so an admin saw a 504 for an approval that had already
   * committed. The cause was startup: app.ts awaited connectProducer(), and
   * kafkajs retries an unreachable broker with exponential backoff, so the port
   * stayed closed and the retries then competed with the first real requests.
   *
   * This pins the half of that invariant which lives in the request path: the
   * event is fired and forgotten. Awaiting the publish instead of voiding it
   * would hand every approval the broker's latency, and this test would hang
   * and fail.
   */
  it('does not wait for the price event to be published', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));
    // A broker that never answers — exactly the unreachable case.
    publish.mockImplementationOnce(() => new Promise(() => {}));

    await expect(
      moderateProduct('p1', 'admin-7', { action: 'approve' } as any),
    ).resolves.toMatchObject({ status: 'ACTIVE' });

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('commits the decision even when Elasticsearch is unreachable', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));
    mockPrisma.product.update.mockResolvedValue(productRow({ status: 'ACTIVE' }));
    indexProduct.mockRejectedValueOnce(new Error('ES down'));

    await expect(
      moderateProduct('p1', 'admin-7', { action: 'approve' } as any),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });
});

// ── Customer-facing reads ─────────────────────────────────────────────────────

describe('getProductById() — public reads see approved listings only', () => {
  it('constrains the query to ACTIVE', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(productRow());

    await getProductById('p1');

    const { where } = mockPrisma.product.findFirst.mock.calls[0][0] as any;
    expect(where.status).toEqual({ in: ['ACTIVE'] });
  });

  it('returns null for a pending listing rather than exposing it', async () => {
    // The ACTIVE filter means Prisma finds nothing for a PENDING_APPROVAL row.
    mockPrisma.product.findFirst.mockResolvedValue(null);

    await expect(getProductById('p1')).resolves.toBeNull();
  });
});

// ── Listings ──────────────────────────────────────────────────────────────────

describe('listSellerProducts()', () => {
  it('scopes every query to the calling seller', async () => {
    mockPrisma.product.findMany.mockResolvedValue([productRow()]);
    mockPrisma.product.count.mockResolvedValue(1);

    await listSellerProducts('seller-1', {});

    const { where } = mockPrisma.product.findMany.mock.calls[0][0] as any;
    expect(where.sellerId).toBe('seller-1');
    // No status filter by default: a seller must see pending and rejected rows.
    expect(where.status).toBeUndefined();
  });
});

describe('listModerationQueue()', () => {
  it('defaults to PENDING_APPROVAL, oldest submission first', async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.product.count.mockResolvedValue(0);

    await listModerationQueue({});

    const call = mockPrisma.product.findMany.mock.calls[0][0] as any;
    expect(call.where.status).toBe('PENDING_APPROVAL');
    expect(call.orderBy[0]).toEqual({ submittedAt: { sort: 'asc', nulls: 'last' } });
  });
});

// ── Image URLs ────────────────────────────────────────────────────────────────
//
// The seller form used to inline uploads as base64 `data:` URIs, and
// `z.string().url()` accepted them: it delegates to `new URL()`, which parses
// `data:`, `javascript:` and `file:` perfectly well. A 2 MB photo therefore
// arrived as ~2.7 MB of string, went into a Postgres text[] column, was copied
// into the Elasticsearch document, and was re-sent to every shopper on every
// listing that rendered it.

describe('createProduct() — image URLs', () => {
  const IMAGE = 'https://cdn.muni.ug/products/honey.jpg';

  it('accepts an https URL, which is what media-service returns', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', { ...VALID_INPUT, images: [IMAGE] } as any);

    const { data } = mockPrisma.product.create.mock.calls[0][0] as any;
    expect(data.images).toEqual([IMAGE]);
  });

  it('accepts http, for a local media-service in development', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', {
      ...VALID_INPUT, images: ['http://localhost:4012/uploads/a.jpg'],
    } as any);

    expect(mockPrisma.product.create).toHaveBeenCalled();
  });

  it('rejects a base64 data: URI', async () => {
    await expect(
      createProduct('seller-1', {
        ...VALID_INPUT,
        images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='],
      } as any),
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(mockPrisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a javascript: URI — these strings end up in an href', async () => {
    await expect(
      createProduct('seller-1', { ...VALID_INPUT, images: ['javascript:alert(1)'] } as any),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('rejects a file: URI', async () => {
    await expect(
      createProduct('seller-1', { ...VALID_INPUT, images: ['file:///etc/passwd'] } as any),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('rejects a data: URI on a VARIANT image too, not just the product', async () => {
    // Same schema, second call site — easy to fix one and miss the other.
    await expect(
      createProduct('seller-1', {
        ...VALID_INPUT,
        variants: [{ stock: 1, images: ['data:image/png;base64,AAAA'] }],
      } as any),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('still allows a product with no images', async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());

    await createProduct('seller-1', VALID_INPUT as any);

    const { data } = mockPrisma.product.create.mock.calls[0][0] as any;
    expect(data.images).toEqual([]);
  });
});
