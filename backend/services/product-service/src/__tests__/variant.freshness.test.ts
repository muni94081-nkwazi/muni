/**
 * variant.freshness.test.ts
 *
 * A stock or price edit must reach the shopper.
 *
 * A product's customer-visible price, stock total and in-stock flag are all
 * derived from its variants — but the variant routes wrote straight to the
 * table and told nothing else. Neither the Redis cache nor the Elasticsearch
 * document was touched.
 *
 * Verified live before this fix, on a real product through the real gateway:
 * after a seller changed one SKU from 50,000 / 10-in-stock to 31,000 / 0,
 *
 *   • the PDP still served price 50,000 and stock 10 for the whole 300-second
 *     cache TTL — long enough for a shopper to add a sold-out variant, and to
 *     be quoted a price the seller had already withdrawn;
 *   • the search document still held the old price and stock, so a
 *     `maxPrice=35000` query missed a product that by then cost 31,000.
 *
 * These assert that every variant write refreshes both projections, and that
 * the index follows the product's moderation status rather than blindly
 * re-adding it.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  product: {
    findUnique:          jest.fn<(...args: any[]) => any>(),
    findUniqueOrThrow:   jest.fn<(...args: any[]) => any>(),
    // refreshProductProjections keeps the derived minVariantPrice in step.
    update:              jest.fn<(...args: any[]) => any>(async () => ({})),
  },
  productVariant: {
    create: jest.fn<(...args: any[]) => any>(),
    update: jest.fn<(...args: any[]) => any>(),
    findUnique: jest.fn<(...args: any[]) => any>(),
  },
  inventoryReservation: { count: jest.fn<(...args: any[]) => any>(async () => 0) },
};
jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

const indexProduct           = jest.fn<(...args: any[]) => any>(async () => undefined);
const deleteProductFromIndex = jest.fn<(...args: any[]) => any>(async () => undefined);
jest.unstable_mockModule('../services/search.service.js', () => ({
  indexProduct,
  deleteProductFromIndex,
  searchProducts: jest.fn<(...args: any[]) => any>(async () => ({ data: [], meta: {}, facets: {} })),
  ensureIndex:    jest.fn<(...args: any[]) => any>(async () => undefined),
}));

const bumpEntityVersion = jest.fn<(...args: any[]) => any>(async () => 1);
jest.unstable_mockModule('../../../../shared/cache/protected-cache.js', () => ({
  bumpEntityVersion,
  entityVersion: jest.fn<(...args: any[]) => any>(async () => 1),
  cached:        jest.fn<(...args: any[]) => any>(async (_k: string, _t: number, loader: any) => loader()),
  CACHE_TTL:     { PRODUCT_DETAIL: 300, PRODUCT_LIST: 60 },
}));

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<(...args: any[]) => any>(async () => undefined),
  connectProducer: jest.fn<(...args: any[]) => any>(async () => undefined),
  disconnectProducer: jest.fn<(...args: any[]) => any>(async () => undefined),
  isProducerReady: jest.fn(() => true),
}));

const { refreshProductProjections } = await import('../services/product.service.js');
const variantService = await import('../services/variant.service.js');

const PRODUCT_ID = 'prod-1';
const SELLER = 'seller-1';

const productRow = (over: Record<string, unknown> = {}) => ({
  id: PRODUCT_ID,
  slug: 'kabira-kettle',
  sellerId: SELLER,
  status: 'ACTIVE',
  name: 'Kabira Kettle',
  description: '',
  basePrice: 50_000,
  compareAtPrice: null,
  currency: 'UGX',
  brand: null,
  tags: [],
  images: [],
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Home', slug: 'home', path: 'home' },
  averageRating: 0,
  reviewCount: 0,
  viewCount: 0,
  rejectionReason: null,
  submittedAt: null,
  moderatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  variants: [{ id: 'v-1', sku: 'K-1', attributes: {}, price: 31_000, compareAtPrice: null, stock: 0, reserved: 0, lowStockThreshold: 2, images: [], active: true }],
  reviews: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.product.findUnique.mockResolvedValue(productRow());
  mockPrisma.product.findUniqueOrThrow.mockResolvedValue(productRow());
  mockPrisma.productVariant.findUnique.mockResolvedValue({
    id: 'v-1', productId: PRODUCT_ID, product: { sellerId: SELLER },
  });
  mockPrisma.productVariant.create.mockResolvedValue({ id: 'v-2', productId: PRODUCT_ID });
  mockPrisma.productVariant.update.mockResolvedValue({ id: 'v-1', productId: PRODUCT_ID });
});

describe('refreshProductProjections', () => {
  it('busts the cached PDP by both id and slug', async () => {
    await refreshProductProjections(PRODUCT_ID);

    expect(bumpEntityVersion).toHaveBeenCalledWith('product', PRODUCT_ID);
    expect(bumpEntityVersion).toHaveBeenCalledWith('product-slug', 'kabira-kettle');
  });

  it('rewrites the search document with the current stock', async () => {
    await refreshProductProjections(PRODUCT_ID);

    expect(indexProduct).toHaveBeenCalledTimes(1);
    const doc = indexProduct.mock.calls[0][0] as any;
    expect(doc.stock).toBe(0);
    expect(doc.inStock).toBe(false);
    expect(doc.stockStatus).toBe('out_of_stock');
  });

  /**
   * Two prices, deliberately, with one meaning each.
   *
   *   price           the seller's product-level list price (basePrice).
   *                   Unchanged meaning — anything already reading the document
   *                   keeps getting what it got before.
   *   minVariantPrice the cheapest ACTIVE variant. What formatProduct shows the
   *                   customer, and therefore what the price filter and the
   *                   price sort run on.
   *
   * They were the same field before, which is why a product displayed at 31,000
   * was missed by `maxPrice=35000` and ordered in a price sort by a figure the
   * shopper never saw.
   */
  it('carries both the list price and the cheapest variant, distinctly', async () => {
    await refreshProductProjections(PRODUCT_ID);

    const doc = indexProduct.mock.calls[0][0] as any;
    expect(doc.price).toBe(50_000);            // basePrice — meaning preserved
    expect(doc.minVariantPrice).toBe(31_000);  // what the customer is shown
  });

  it('recomputes minVariantPrice from the active variants', async () => {
    await refreshProductProjections(PRODUCT_ID);

    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minVariantPrice: 31_000 } }),
    );
  });

  it('falls back to basePrice when a product has no active variant', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(productRow({ variants: [] }));

    await refreshProductProjections(PRODUCT_ID);

    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minVariantPrice: 50_000 } }),
    );
  });

  it('removes a product from the index when it is no longer ACTIVE', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(productRow({ status: 'PENDING_APPROVAL' }));

    await refreshProductProjections(PRODUCT_ID);

    expect(deleteProductFromIndex).toHaveBeenCalledWith(PRODUCT_ID);
    expect(indexProduct).not.toHaveBeenCalled();
  });

  it('still clears the cache when the index write fails', async () => {
    indexProduct.mockRejectedValueOnce(new Error('ES down'));

    await expect(refreshProductProjections(PRODUCT_ID)).resolves.toBeUndefined();

    // A search outage must not also leave the PDP serving a withdrawn price.
    expect(bumpEntityVersion).toHaveBeenCalledWith('product', PRODUCT_ID);
  });

  it('does nothing for a product that no longer exists', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);

    await refreshProductProjections('gone');

    expect(bumpEntityVersion).not.toHaveBeenCalled();
    expect(indexProduct).not.toHaveBeenCalled();
  });
});

describe('every variant write refreshes the product', () => {
  it('refreshes after a price or stock update — the live bug', async () => {
    await variantService.updateVariant('v-1', { price: 31_000, stock: 0 } as any, SELLER);

    expect(bumpEntityVersion).toHaveBeenCalledWith('product', PRODUCT_ID);
    expect(indexProduct).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a new SKU is added', async () => {
    await variantService.createVariant(
      PRODUCT_ID,
      { sku: 'K-2', attributes: { color: 'Red' }, price: 40_000, stock: 5, lowStockThreshold: 2, images: [] } as any,
      SELLER,
    );

    expect(bumpEntityVersion).toHaveBeenCalledWith('product', PRODUCT_ID);
    expect(indexProduct).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a SKU is retired', async () => {
    await variantService.deleteVariant('v-1', SELLER);

    expect(bumpEntityVersion).toHaveBeenCalledWith('product', PRODUCT_ID);
    expect(indexProduct).toHaveBeenCalledTimes(1);
  });

  it('refreshes nothing when the caller does not own the product', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValue({
      id: 'v-1', productId: PRODUCT_ID, product: { sellerId: 'someone-else' },
    });

    await expect(
      variantService.updateVariant('v-1', { price: 1 } as any, SELLER),
    ).rejects.toBeDefined();

    expect(bumpEntityVersion).not.toHaveBeenCalled();
    expect(indexProduct).not.toHaveBeenCalled();
  });
});
