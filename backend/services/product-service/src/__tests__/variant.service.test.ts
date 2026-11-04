/**
 * Phase 7 — Variant Service Unit Tests
 *
 * Tests SKU generation, variant CRUD, and deletion guard.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mock Prisma ───────────────────────────────────────────────────────────────
const mockPrisma = {
  productVariant: {
    findMany:   jest.fn<(...args: any[]) => any>(),
    findUnique: jest.fn<(...args: any[]) => any>(),
    create:     jest.fn<(...args: any[]) => any>(),
    update:     jest.fn<(...args: any[]) => any>(),
  },
  product: {
    findUniqueOrThrow: jest.fn<(...args: any[]) => any>(),
  },
  inventoryReservation: {
    count: jest.fn<(...args: any[]) => any>(),
  },
};

jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

// Variant writes now refresh the product's cached PDP and its search document.
// That work belongs to product.service, which owns both; here it is stubbed so
// these stay tests of the variant layer. The call itself is asserted in
// variant.freshness.test.ts.
const refreshProductProjections = jest.fn<(...args: any[]) => any>(async () => undefined);
jest.unstable_mockModule('../services/product.service.js', () => ({ refreshProductProjections }));

const { generateSKU, createVariant, updateVariant, deleteVariant, getVariantsByProduct } =
  await import('../services/variant.service.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('variant.service — generateSKU()', () => {
  it('generates uppercase SKU from product slug and attributes', () => {
    const sku = generateSKU('mens-polo-shirt', { color: 'Red', size: 'M' });
    // Should start with MPS (Men-Polo-Shirt initials)
    expect(sku).toMatch(/^MPS-/);
    expect(sku).toMatch(/RED/);
    expect(sku).toMatch(/M-/);
    expect(sku).toMatch(/[A-Z0-9-]+/);
  });

  it('generates unique SKUs for different attribute combos', () => {
    // Different timestamps → different suffix (use spy to control Date.now)
    const sku1 = generateSKU('t-shirt', { color: 'Blue', size: 'S' });
    const sku2 = generateSKU('t-shirt', { color: 'Red',  size: 'L' });
    // Both should have the same prefix but differ in attribute section
    expect(sku1).not.toBe(sku2);
  });

  it('handles single-word product slugs', () => {
    const sku = generateSKU('phone', { storage: '128GB' });
    expect(sku).toMatch(/^P-/);
  });
});

describe('variant.service — getVariantsByProduct()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('attaches availableStock and inStock computed fields', async () => {
    mockPrisma.productVariant.findMany.mockResolvedValueOnce([
      { id: 'v1', productId: 'p1', sku: 'SKU-001', stock: 10, reserved: 3, lowStockThreshold: 5, active: true, attributes: { color: 'Red' }, price: 45000, createdAt: new Date() },
      { id: 'v2', productId: 'p1', sku: 'SKU-002', stock: 0,  reserved: 0, lowStockThreshold: 5, active: true, attributes: { color: 'Blue' }, price: 45000, createdAt: new Date() },
    ]);

    const variants = await getVariantsByProduct('p1') as Array<{ id: string; availableStock: number; inStock: boolean }>;

    expect(variants[0].availableStock).toBe(7);   // 10 - 3
    expect(variants[0].inStock).toBe(true);
    expect(variants[1].availableStock).toBe(0);
    expect(variants[1].inStock).toBe(false);
  });
});

describe('variant.service — createVariant()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('auto-generates SKU when none provided', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'p1', slug: 'cotton-t-shirt', sellerId: 'seller-1',
    });
    mockPrisma.productVariant.create.mockResolvedValueOnce({
      id: 'v1', sku: 'CTS-RED-M-XXXX',
    });

    await createVariant('p1', {
      attributes:   { color: 'Red', size: 'M' },
      price:        45000,
      stock:        20,
      lowStockThreshold: 5,
      images:       [],
    }, 'seller-1');

    // SKU should have been auto-generated (starts with CTS for Cotton-T-Shirt)
    const createCall = mockPrisma.productVariant.create.mock.calls[0][0];
    expect(createCall.data.sku).toMatch(/^CTS-/);
    expect(createCall.data.productId).toBe('p1');
  });

  it('uses provided SKU when explicitly given', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValueOnce({ id: 'p1', slug: 'dress', sellerId: 'seller-1' });
    mockPrisma.productVariant.create.mockResolvedValueOnce({ id: 'v1', sku: 'CUSTOM-SKU-001' });

    await createVariant('p1', {
      sku:          'CUSTOM-SKU-001',
      attributes:   { color: 'Green' },
      price:        80000,
      stock:        5,
      lowStockThreshold: 2,
      images:       [],
    }, 'seller-1');

    const createCall = mockPrisma.productVariant.create.mock.calls[0][0];
    expect(createCall.data.sku).toBe('CUSTOM-SKU-001');
  });
});

/** A variant whose parent product belongs to `sellerId`. */
function ownedVariant(sellerId = 'seller-1') {
  return { id: 'v1', productId: 'p1', product: { sellerId } };
}

describe('variant.service — deleteVariant()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('blocks deletion when active reservations exist', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant());
    mockPrisma.inventoryReservation.count.mockResolvedValueOnce(3);

    await expect(deleteVariant('v1', 'seller-1'))
      .rejects.toThrow('3 active cart reservation(s)');

    expect(mockPrisma.productVariant.update).not.toHaveBeenCalled();
  });

  it('soft-deletes variant when no active reservations exist', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant());
    mockPrisma.inventoryReservation.count.mockResolvedValueOnce(0);
    mockPrisma.productVariant.update.mockResolvedValueOnce({ id: 'v1', active: false });

    await deleteVariant('v1', 'seller-1');

    expect(mockPrisma.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
  });
});

// ─── Ownership ────────────────────────────────────────────────────────────────
//
// createVariant carried the comment "Verify product exists and belongs to
// seller" while only ever checking that the product existed. The route is
// mounted `pub()` at the gateway, so any signed-in customer could add a
// variant — at any price — to any seller's listing, and the checkout saga
// prices from exactly this table.

describe('variant.service — createVariant() ownership', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const input = {
    attributes:        { color: 'Red' },
    price:             45000,
    stock:             20,
    lowStockThreshold: 5,
    images:            [],
  };

  it('lets the owning seller add a variant', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'p1', slug: 'shirt', sellerId: 'seller-1',
    });
    mockPrisma.productVariant.create.mockResolvedValueOnce({ id: 'v1', sku: 'S-RED' });

    await expect(createVariant('p1', input, 'seller-1')).resolves.toBeDefined();
    expect(mockPrisma.productVariant.create).toHaveBeenCalled();
  });

  it('refuses a caller who does not own the product', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'p1', slug: 'shirt', sellerId: 'seller-1',
    });

    await expect(createVariant('p1', input, 'someone-else'))
      .rejects.toMatchObject({ name: 'NotProductOwnerError', status: 403 });
  });

  it('writes nothing when ownership fails', async () => {
    // The guard has to run before the insert, or a rejected request still
    // leaves a variant on someone else's product.
    mockPrisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'p1', slug: 'shirt', sellerId: 'seller-1',
    });

    await expect(createVariant('p1', input, 'attacker')).rejects.toThrow();
    expect(mockPrisma.productVariant.create).not.toHaveBeenCalled();
  });

  it('403s rather than 404s — the product exists, the caller just is not its owner', async () => {
    mockPrisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'p1', slug: 'shirt', sellerId: 'seller-1',
    });

    // A 404 here would deny that a product the caller can already see on the
    // storefront exists at all.
    await expect(createVariant('p1', input, 'attacker'))
      .rejects.toMatchObject({ status: 403 });
  });
});

// ─── Ownership on the variant-addressed mutations ─────────────────────────────
//
// updateVariant and deleteVariant had the same hole createVariant did, and it
// is worse on update: re-pricing an existing SKU needs no new row and shows up
// nowhere in the seller's catalogue. The checkout saga prices from this table,
// so a variant edited to cost 1 is a purchase the system honours.
//
// These two address a variant directly, so ownership is reached through the
// variant's parent product rather than from a productId in the path.

describe('variant.service — updateVariant() ownership', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('lets the owning seller update their own variant', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));
    mockPrisma.productVariant.update.mockResolvedValueOnce({ id: 'v1', price: 50000 });

    await expect(updateVariant('v1', { price: 50000 }, 'seller-1')).resolves.toBeDefined();
    expect(mockPrisma.productVariant.update).toHaveBeenCalled();
  });

  it('refuses a caller who does not own the variant', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));

    await expect(updateVariant('v1', { price: 1 }, 'someone-else'))
      .rejects.toMatchObject({ name: 'NotProductOwnerError', status: 403 });
  });

  it('writes nothing when ownership fails', async () => {
    // The guard has to run before the update, or the rejected request still
    // leaves someone else's SKU re-priced.
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));

    await expect(updateVariant('v1', { price: 1 }, 'attacker')).rejects.toThrow();
    expect(mockPrisma.productVariant.update).not.toHaveBeenCalled();
  });

  it('checks ownership before validating the payload', async () => {
    // Otherwise a malformed body from a non-owner returns 422, which tells an
    // attacker their input shape was the only thing wrong.
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));

    await expect(updateVariant('v1', { price: -5 } as never, 'attacker'))
      .rejects.toMatchObject({ status: 403 });
  });

  it('404s for a variant that does not exist', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(null);

    await expect(updateVariant('nope', { price: 1 }, 'seller-1'))
      .rejects.toMatchObject({ name: 'VariantNotFoundError', status: 404 });
  });
});

describe('variant.service — deleteVariant() ownership', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('lets the owning seller delete their own variant', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));
    mockPrisma.inventoryReservation.count.mockResolvedValueOnce(0);
    mockPrisma.productVariant.update.mockResolvedValueOnce({ id: 'v1', active: false });

    await expect(deleteVariant('v1', 'seller-1')).resolves.toBeDefined();
    expect(mockPrisma.productVariant.update).toHaveBeenCalled();
  });

  it('refuses a caller who does not own the variant', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));

    await expect(deleteVariant('v1', 'someone-else'))
      .rejects.toMatchObject({ name: 'NotProductOwnerError', status: 403 });
  });

  it('deletes nothing when ownership fails', async () => {
    // Soft delete goes through `update`, not `delete` — the row is kept so
    // historical order lines still resolve.
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));

    await expect(deleteVariant('v1', 'attacker')).rejects.toThrow();
    expect(mockPrisma.productVariant.update).not.toHaveBeenCalled();
  });

  it('checks ownership before counting reservations', async () => {
    // A non-owner must be refused outright, not told how many carts are
    // holding another seller's stock.
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(ownedVariant('seller-1'));

    await expect(deleteVariant('v1', 'attacker')).rejects.toThrow();
    expect(mockPrisma.inventoryReservation.count).not.toHaveBeenCalled();
  });

  it('404s for a variant that does not exist', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValueOnce(null);

    await expect(deleteVariant('nope', 'seller-1'))
      .rejects.toMatchObject({ name: 'VariantNotFoundError', status: 404 });
  });
});
