/**
 * order.service.test.ts
 *
 * Unit tests for order.service using an in-memory mock repository.
 * No real MongoDB required.
 *
 * ESM Note: With --experimental-vm-modules, jest globals must be imported
 * explicitly from @jest/globals and module mocking uses jest.unstable_mockModule
 * called before dynamic imports of the modules under test.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { CreateOrderInput, OrderLineRequest } from '../services/order.service.js';
import type { IOrderRepository, PaginatedResult, AdminOrderFilters, AdminOrderStats } from '../repositories/order.repository.js';
import type { Order, SubOrder, SubOrderStatus } from '../models/order.model.js';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../db/mongoose.js', () => ({
  connectDB:    () => Promise.resolve(),
  disconnectDB: () => Promise.resolve(),
  isDBReady:    () => true,
}));

// ─── Catalogue / inventory doubles ────────────────────────────────────────────
//
// order.service is now defined as much by what it refuses to read as by what
// it computes, so the catalogue is a recording double: the tests assert both
// the prices that came back and the reservation calls that were made.

class ItemUnavailableError extends Error {
  readonly status = 409;
  constructor(reference: string) {
    super(`"${reference}" is no longer available and was removed from your order.`);
    this.name = 'ItemUnavailableError';
  }
}

class OutOfStockError extends Error {
  readonly status = 409;
  constructor(reference: string, readonly available?: number) {
    super(`Only ${available} of "${reference}" left — please reduce the quantity.`);
    this.name = 'OutOfStockError';
  }
}

interface CatalogVariantStub {
  id: string; productId: string; sku: string; price: number;
  productName: string; sellerId: string; currency: string;
  weightKg?: number | null; images?: string[];
}

/** variantId → catalogue answer. Tests mutate this to shape a scenario. */
const catalog = new Map<string, CatalogVariantStub>();

/** variantIds that inventory should refuse to reserve. */
const outOfStock = new Set<string>();

const reserveCalls: Array<{ variantId: string; quantity: number }> = [];
const releaseCalls: Array<{ variantId: string; reservationId: string }> = [];

const mockFetchVariant = jest.fn(async (variantId: string) => {
  const variant = catalog.get(variantId);
  if (!variant) throw new ItemUnavailableError(variantId);
  return variant;
});

const mockReserveStock = jest.fn(
  async (variantId: string, quantity: number, _sessionId: string, reference: string) => {
    reserveCalls.push({ variantId, quantity });
    if (outOfStock.has(variantId)) throw new OutOfStockError(reference, 1);
    return `res-${variantId}`;
  },
);

const mockReleaseStock = jest.fn(async (variantId: string, reservationId: string) => {
  releaseCalls.push({ variantId, reservationId });
});

// Cancelling used to move no stock at all: the order flipped to 'cancelled'
// and its deducted units were gone from the catalogue for good.
const restoreCalls: Array<{ variantId: string; quantity: number }> = [];
const mockRestoreStock = jest.fn(async (variantId: string, quantity: number) => {
  restoreCalls.push({ variantId, quantity });
  return true;
});

// Nothing created delivery jobs before Stage 8. order-service now books one
// when a seller accepts a sub-order; this stands in for the HTTP call.
const bookedJobs: Array<{ orderId: string; subOrderId: string; sellerId: string }> = [];
const mockBookDeliveryJob = jest.fn(async (order: any, subOrder: any) => {
  bookedJobs.push({ orderId: subOrder.masterOrderId, subOrderId: subOrder.id, sellerId: subOrder.sellerId });
  return true;
});

jest.unstable_mockModule('../clients/fulfillment.client.js', () => ({
  bookDeliveryJob: mockBookDeliveryJob,
  BOOK_JOB_AT_STATUS: 'processing',
  fulfillmentClient: { bookDeliveryJob: mockBookDeliveryJob, BOOK_JOB_AT_STATUS: 'processing' },
}));

jest.unstable_mockModule('../clients/catalog.client.js', () => ({
  fetchVariant:  mockFetchVariant,
  reserveStock:  mockReserveStock,
  releaseStock:  mockReleaseStock,
  restoreStock:  mockRestoreStock,
  ItemUnavailableError,
  OutOfStockError,
  CatalogUnavailableError: class extends Error {},
}));

// Dynamic import AFTER mocks — required for ESM Jest
const orderService = await import('../services/order.service.js');

function stubVariant(overrides: Partial<CatalogVariantStub> & { id: string }): CatalogVariantStub {
  const variant: CatalogVariantStub = {
    productId:   `prod-for-${overrides.id}`,
    sku:         `SKU-${overrides.id}`,
    price:       1000,
    productName: `Product ${overrides.id}`,
    sellerId:    'vendor-A',
    currency:    'UGX',
    weightKg:    null,
    images:      [],
    ...overrides,
  };
  catalog.set(variant.id, variant);
  return variant;
}

// ─── In-Memory Mock Repository ────────────────────────────────────────────────

class InMemoryOrderRepository implements IOrderRepository {
  private orders = new Map<string, Order>();
  private seq = 999;

  async nextOrderNumber(): Promise<string> {
    this.seq += 1;
    return `MUNI-${this.seq}`;
  }

  async create(order: Order): Promise<Order> {
    // Mirrors the unique sparse index on checkoutSessionId. Without this the
    // double would happily store two orders for one checkout session and the
    // idempotency tests would pass against a repository that cannot actually
    // enforce what production enforces.
    //
    // The condition is `in`, not truthiness, because that is what sparse
    // actually means in MongoDB: a document is skipped only when the field is
    // ABSENT. An explicit null is indexed like any other value, so two of them
    // collide. This double used to skip every falsy value, which made it agree
    // with what the index was believed to do rather than what it does — and
    // that is why a service writing `checkoutSessionId: null` on every direct
    // order passed here while failing on the second one in production.
    if ('checkoutSessionId' in order && order.checkoutSessionId !== undefined) {
      for (const existing of this.orders.values()) {
        if (
          'checkoutSessionId' in existing &&
          existing.checkoutSessionId !== undefined &&
          existing.checkoutSessionId === order.checkoutSessionId
        ) {
          throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
        }
      }
    }
    this.orders.set(order.id, order);
    return order;
  }

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async findByCheckoutSessionId(checkoutSessionId: string): Promise<Order | null> {
    for (const order of this.orders.values()) {
      if (order.checkoutSessionId === checkoutSessionId) return order;
    }
    return null;
  }

  async findByUserId(id: string, userId: string): Promise<Order | null> {
    const order = this.orders.get(id);
    return order && order.userId === userId ? order : null;
  }

  async findOrderContainingSubOrder(subOrderId: string): Promise<Order | null> {
    for (const order of this.orders.values()) {
      if (order.subOrders.some((so) => so.id === subOrderId)) return order;
    }
    return null;
  }

  async listByUser(userId: string, page: number, perPage: number): Promise<PaginatedResult<Order>> {
    const all = [...this.orders.values()]
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * perPage;
    return { data: all.slice(start, start + perPage), total: all.length };
  }

  async listSubOrdersBySeller(
    sellerId: string,
    status: SubOrderStatus | undefined,
    page: number,
    perPage: number,
  ): Promise<PaginatedResult<SubOrder>> {
    let all = [...this.orders.values()].flatMap((o) => o.subOrders).filter((so) => so.sellerId === sellerId);
    if (status) all = all.filter((so) => so.status === status);
    all = all.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    const start = (page - 1) * perPage;
    return { data: all.slice(start, start + perPage), total: all.length };
  }

  async listAll(
    filters: AdminOrderFilters,
    page: number,
    perPage: number,
  ): Promise<PaginatedResult<Order>> {
    let all = [...this.orders.values()];
    if (filters.status)   all = all.filter((o) => o.status === filters.status);
    if (filters.sellerId) all = all.filter((o) => o.subOrders.some((so) => so.sellerId === filters.sellerId));
    if (filters.q)        all = all.filter((o) => o.orderNumber === filters.q || o.userId === filters.q);
    all = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * perPage;
    return { data: all.slice(start, start + perPage), total: all.length };
  }

  async replace(order: Order): Promise<Order> {
    if (!this.orders.has(order.id)) throw Object.assign(new Error('Order not found'), { status: 404 });
    this.orders.set(order.id, order);
    return order;
  }

  async adminStats(): Promise<AdminOrderStats> {
    const all = [...this.orders.values()];
    const settled = all.filter((o) => o.status === 'completed');
    const ordersByStatus: Record<string, number> = {};
    for (const order of all) ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;

    return {
      gmv: settled.reduce((sum, o) => sum + o.totalAmount, 0),
      platformCommission: settled.reduce(
        (sum, o) => sum + o.subOrders.reduce((s, so) => s + so.platformCommission, 0),
        0,
      ),
      totalOrders: all.length,
      ordersByStatus,
      gmvByMonth: [],
      currency: 'UGX',
    };
  }

  async listRecent(limit: number): Promise<Order[]> {
    return [...this.orders.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

describe('Multi-Vendor Order Service', () => {
  let repo: InMemoryOrderRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new InMemoryOrderRepository();
    catalog.clear();
    outOfStock.clear();
    reserveCalls.length = 0;
    releaseCalls.length = 0;
    restoreCalls.length = 0;
    bookedJobs.length = 0;
  });

  describe('create multi-vendor master order', () => {
    it('creates 1 Master Order and 2 Sub-Orders for 2 different vendors', async () => {
      stubVariant({ id: 'var-coffee', productId: 'prod-1', sku: 'COF-001', price: 20000, productName: 'Coffee', sellerId: 'vendor-A' });
      stubVariant({ id: 'var-honey',  productId: 'prod-2', sku: 'HNY-001', price: 35000, productName: 'Honey',  sellerId: 'vendor-B' });

      const input: CreateOrderInput = {
        userId: 'user-123',
        items: [
          { productId: 'prod-1', variantId: 'var-coffee', quantity: 2 },
          { productId: 'prod-2', variantId: 'var-honey',  quantity: 1 },
        ],
        shipping: {
          address: 'Plot 42 Kampala Rd',
          city: 'Kampala',
          phone: '+256770000000',
        },
        vendorShippingFees: {
          'vendor-A': 5000,
          'vendor-B': 7000,
        },
      };

      const masterOrder = await orderService.create(input, repo);

      expect(masterOrder.id).toBeDefined();
      expect(masterOrder.orderNumber).toMatch(/^MUNI-/);
      expect(masterOrder.subOrders).toHaveLength(2);

      // Verify sub-orders
      const subOrderA = masterOrder.subOrders.find((so) => so.sellerId === 'vendor-A')!;
      const subOrderB = masterOrder.subOrders.find((so) => so.sellerId === 'vendor-B')!;

      expect(subOrderA).toBeDefined();
      expect(subOrderA.subtotal).toBe(40000);
      expect(subOrderA.shippingFee).toBe(5000);
      expect(subOrderA.platformCommission).toBe(5000); // 12.5% of 40000 = 5000
      expect(subOrderA.vendorShare).toBe(35000); // 40000 - 5000 = 35000

      expect(subOrderB).toBeDefined();
      expect(subOrderB.subtotal).toBe(35000);
      expect(subOrderB.shippingFee).toBe(7000);

      // Total master order check
      expect(masterOrder.subtotal).toBe(75000);
      expect(masterOrder.shippingFee).toBe(12000);
      expect(masterOrder.totalAmount).toBe(87000);

      expect(mockPublish).toHaveBeenCalled();
    });
  });

  // ─── Per-seller discount attribution ──────────────────────────────────────
  //
  // Every sub-order used to carry `discountAmount: 0` while the master carried
  // the whole coupon, so `sum(subOrder.totalAmount)` was short by exactly the
  // discount and every `vendorShare` was computed on the gross. The platform
  // silently funded every promotion, including a seller's own.

  describe('per-seller discount attribution', () => {
    /** Two sellers: A holds 40,000 of goods, B holds 35,000. */
    function twoSellers(): CreateOrderInput {
      stubVariant({ id: 'var-coffee', productId: 'prod-1', sku: 'COF-001', price: 20000, productName: 'Coffee', sellerId: 'vendor-A' });
      stubVariant({ id: 'var-honey',  productId: 'prod-2', sku: 'HNY-001', price: 35000, productName: 'Honey',  sellerId: 'vendor-B' });

      return {
        userId: 'user-123',
        items: [
          { productId: 'prod-1', variantId: 'var-coffee', quantity: 2 },
          { productId: 'prod-2', variantId: 'var-honey',  quantity: 1 },
        ],
        shipping: { address: 'Plot 42 Kampala Rd', city: 'Kampala', phone: '+256770000000' },
        vendorShippingFees: { 'vendor-A': 5000, 'vendor-B': 7000 },
      };
    }

    const subOrderFor = (order: Order, sellerId: string) =>
      order.subOrders.find((so) => so.sellerId === sellerId)!;

    it('takes a seller-restricted discount off that seller alone', async () => {
      const order = await orderService.create({
        ...twoSellers(),
        couponCode: 'VENDORA10',
        discountAmount: 4000,
        vendorDiscounts: { 'vendor-A': 4000 },
      }, repo);

      expect(subOrderFor(order, 'vendor-A').discountAmount).toBe(4000);
      expect(subOrderFor(order, 'vendor-B').discountAmount).toBe(0);
    });

    it('leaves the untouched seller vendorShare exactly as it was', async () => {
      // The whole point: seller B did not fund seller A's promotion, so their
      // settlement figure must be byte-for-byte what it is with no coupon.
      const plain    = await orderService.create(twoSellers(), repo);
      const withCoupon = await orderService.create({
        ...twoSellers(),
        discountAmount: 4000,
        vendorDiscounts: { 'vendor-A': 4000 },
      }, repo);

      expect(subOrderFor(withCoupon, 'vendor-B').vendorShare)
        .toBe(subOrderFor(plain, 'vendor-B').vendorShare);
      expect(subOrderFor(withCoupon, 'vendor-B').totalAmount)
        .toBe(subOrderFor(plain, 'vendor-B').totalAmount);
    });

    it('computes the discounted seller share and commission on the net', async () => {
      const order = await orderService.create({
        ...twoSellers(),
        discountAmount: 4000,
        vendorDiscounts: { 'vendor-A': 4000 },
      }, repo);

      const a = subOrderFor(order, 'vendor-A');
      // 40,000 goods − 4,000 discount = 36,000 realised.
      expect(a.discountAmount).toBe(4000);
      expect(a.platformCommission).toBe(4500);        // 12.5% of 36,000
      expect(a.vendorShare).toBe(31500);              // 36,000 − 4,500
      expect(a.vendorShare + a.platformCommission).toBe(36000);
      expect(a.totalAmount).toBe(41000);              // 36,000 + 5,000 shipping
    });

    it('splits a discount that spans both sellers', async () => {
      const order = await orderService.create({
        ...twoSellers(),
        discountAmount: 7500,
        vendorDiscounts: { 'vendor-A': 4000, 'vendor-B': 3500 },
      }, repo);

      expect(subOrderFor(order, 'vendor-A').discountAmount).toBe(4000);
      expect(subOrderFor(order, 'vendor-B').discountAmount).toBe(3500);
      expect(order.discountAmount).toBe(7500);
    });

    it('reconciles: the sub-orders add up to the master total', async () => {
      // This did not hold before — the master subtracted the coupon and no
      // sub-order did, so the two disagreed by exactly the discount.
      const order = await orderService.create({
        ...twoSellers(),
        discountAmount: 7500,
        vendorDiscounts: { 'vendor-A': 4000, 'vendor-B': 3500 },
      }, repo);

      const subTotalSum = order.subOrders.reduce((sum, so) => sum + so.totalAmount, 0);
      expect(subTotalSum).toBe(order.totalAmount);

      const discountSum = order.subOrders.reduce((sum, so) => sum + so.discountAmount, 0);
      expect(discountSum).toBe(order.discountAmount);
    });

    it('never lets an allocation drive a sub-order below zero', async () => {
      // A slice larger than that seller's goods is clamped to their goods
      // rather than producing a negative sub-order.
      const order = await orderService.create({
        ...twoSellers(),
        discountAmount: 999_999,
        vendorDiscounts: { 'vendor-A': 999_999 },
      }, repo);

      const a = subOrderFor(order, 'vendor-A');
      expect(a.discountAmount).toBe(40000);           // capped at their goods
      expect(a.vendorShare).toBe(0);
      expect(a.totalAmount).toBe(5000);               // shipping only
      expect(order.discountAmount).toBe(40000);       // master follows the parts
    });

    it('gives a seller named in no allocation exactly zero', async () => {
      const order = await orderService.create({
        ...twoSellers(),
        discountAmount: 4000,
        vendorDiscounts: { 'vendor-A': 4000 },        // vendor-B absent entirely
      }, repo);

      expect(subOrderFor(order, 'vendor-B').discountAmount).toBe(0);
    });

    it('ignores an allocation naming a seller who is not in the order', async () => {
      const order = await orderService.create({
        ...twoSellers(),
        discountAmount: 4000,
        vendorDiscounts: { 'vendor-A': 4000, 'vendor-ghost': 9999 },
      }, repo);

      expect(order.subOrders.map((so) => so.sellerId).sort()).toEqual(['vendor-A', 'vendor-B']);
      expect(order.discountAmount).toBe(4000);        // the ghost contributed nothing
    });

    it('leaves an order with no allocation exactly as it was', async () => {
      // The direct `POST /orders` path sends no breakdown. Its behaviour must
      // not move: master carries the discount, sub-orders carry none.
      const order = await orderService.create({
        ...twoSellers(),
        discountAmount: 4000,
      }, repo);

      expect(order.discountAmount).toBe(4000);
      expect(order.subOrders.every((so) => so.discountAmount === 0)).toBe(true);
      expect(subOrderFor(order, 'vendor-A').vendorShare).toBe(35000);   // gross, as before
    });

    it('applies a single-seller discount to the only sub-order', async () => {
      stubVariant({ id: 'var-solo', productId: 'prod-9', sku: 'SOL-1', price: 10000, productName: 'Solo', sellerId: 'vendor-A' });

      const order = await orderService.create({
        userId: 'user-123',
        items: [{ productId: 'prod-9', variantId: 'var-solo', quantity: 1 }],
        shipping: { address: 'Plot 42', city: 'Kampala', phone: '+256770000000' },
        discountAmount: 1000,
        vendorDiscounts: { 'vendor-A': 1000 },
      }, repo);

      expect(order.subOrders).toHaveLength(1);
      expect(order.subOrders[0].discountAmount).toBe(1000);
      expect(order.subOrders[0].vendorShare).toBe(7875);   // 9,000 − 12.5%
      expect(order.discountAmount).toBe(1000);
    });

    it('leaves vendor shares untouched by a FREE_SHIPPING coupon', async () => {
      // Its goods discount is zero for everyone, so no payout may move.
      const plain = await orderService.create(twoSellers(), repo);
      const free  = await orderService.create({
        ...twoSellers(),
        couponCode: 'FREESHIP',
        discountAmount: 0,
        vendorDiscounts: { 'vendor-A': 0, 'vendor-B': 0 },
      }, repo);

      for (const sellerId of ['vendor-A', 'vendor-B']) {
        expect(subOrderFor(free, sellerId).vendorShare)
          .toBe(subOrderFor(plain, sellerId).vendorShare);
        expect(subOrderFor(free, sellerId).discountAmount).toBe(0);
      }
    });
  });

  // ─── Tax ──────────────────────────────────────────────────────────────────
  //
  // Both the master order and every sub-order hardcoded `taxAmount: 0`, so an
  // order recorded a total short by exactly the tax the customer had paid.

  describe('tax', () => {
    function twoSellerInput(): CreateOrderInput {
      stubVariant({ id: 'var-coffee', productId: 'prod-1', sku: 'COF-001', price: 20000, productName: 'Coffee', sellerId: 'vendor-A' });
      stubVariant({ id: 'var-honey',  productId: 'prod-2', sku: 'HNY-001', price: 35000, productName: 'Honey',  sellerId: 'vendor-B' });

      return {
        userId: 'user-123',
        items: [
          { productId: 'prod-1', variantId: 'var-coffee', quantity: 2 },
          { productId: 'prod-2', variantId: 'var-honey',  quantity: 1 },
        ],
        shipping: { address: 'Plot 42 Kampala Rd', city: 'Kampala', phone: '+256770000000' },
        vendorShippingFees: { 'vendor-A': 5000, 'vendor-B': 7000 },
      };
    }

    const subOrderFor = (order: Order, sellerId: string) =>
      order.subOrders.find((so) => so.sellerId === sellerId)!;

    it('records the tax it was given on each sub-order', async () => {
      const order = await orderService.create({
        ...twoSellerInput(),
        vendorTaxes: { 'vendor-A': 200, 'vendor-B': 150 },
      }, repo);

      expect(subOrderFor(order, 'vendor-A').taxAmount).toBe(200);
      expect(subOrderFor(order, 'vendor-B').taxAmount).toBe(150);
      expect(order.taxAmount).toBe(350);
    });

    it('adds tax into the totals rather than recording it and ignoring it', async () => {
      const order = await orderService.create({
        ...twoSellerInput(),
        vendorTaxes: { 'vendor-A': 200, 'vendor-B': 150 },
      }, repo);

      // vendor-A: 40,000 goods + 5,000 shipping + 200 tax
      expect(subOrderFor(order, 'vendor-A').totalAmount).toBe(45200);
      // 75,000 goods + 12,000 shipping + 350 tax
      expect(order.totalAmount).toBe(87350);
    });

    it('reconciles: the sub-orders still add up to the master total', async () => {
      const order = await orderService.create({
        ...twoSellerInput(),
        discountAmount: 4000,
        vendorDiscounts: { 'vendor-A': 4000 },
        vendorTaxes: { 'vendor-A': 200, 'vendor-B': 150 },
      }, repo);

      const subSum = order.subOrders.reduce((sum, so) => sum + so.totalAmount, 0);
      expect(subSum).toBe(order.totalAmount);

      const taxSum = order.subOrders.reduce((sum, so) => sum + so.taxAmount, 0);
      expect(taxSum).toBe(order.taxAmount);
    });

    it('leaves the vendor share alone — tax is not the seller money', async () => {
      const plain = await orderService.create(twoSellerInput(), repo);
      const taxed = await orderService.create({
        ...twoSellerInput(),
        vendorTaxes: { 'vendor-A': 200, 'vendor-B': 150 },
      }, repo);

      for (const sellerId of ['vendor-A', 'vendor-B']) {
        expect(subOrderFor(taxed, sellerId).vendorShare)
          .toBe(subOrderFor(plain, sellerId).vendorShare);
        expect(subOrderFor(taxed, sellerId).platformCommission)
          .toBe(subOrderFor(plain, sellerId).platformCommission);
      }
    });

    it('leaves an order with no tax input exactly as it was', async () => {
      const order = await orderService.create(twoSellerInput(), repo);

      expect(order.taxAmount).toBe(0);
      expect(order.subOrders.every((so) => so.taxAmount === 0)).toBe(true);
      expect(order.totalAmount).toBe(87000);
    });
  });

  // ─── Price integrity ────────────────────────────────────────────────────────
  //
  // These are the regression tests for the defect this path was built around:
  // order-service used to sum `unitPrice`/`lineTotal` straight off the request,
  // so a customer could name their own price.

  describe('price integrity', () => {
    it('ignores client-supplied unitPrice and lineTotal entirely', async () => {
      stubVariant({ id: 'var-1', price: 50000, productName: 'Laptop Stand', sellerId: 'vendor-A' });

      const order = await orderService.create(
        {
          userId: 'attacker',
          items: [
            // Everything monetary here is a lie. None of it should survive.
            {
              productId: 'prod-1',
              variantId: 'var-1',
              quantity: 2,
              unitPrice: 1,
              lineTotal: 2,
            } as unknown as OrderLineRequest,
          ],
          shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          vendorShippingFees: { 'vendor-A': 0 },
        },
        repo,
      );

      expect(order.items[0].unitPrice).toBe(50000);
      expect(order.items[0].lineTotal).toBe(100000);
      expect(order.subtotal).toBe(100000);
      expect(order.totalAmount).toBe(100000);
    });

    it('takes product name, sku and seller from the catalogue, not the request', async () => {
      stubVariant({
        id: 'var-1', productId: 'real-prod', sku: 'REAL-SKU',
        price: 7500, productName: 'Real Product', sellerId: 'real-vendor',
      });

      const order = await orderService.create(
        {
          userId: 'user-1',
          items: [
            {
              productId: 'spoofed-prod',
              variantId: 'var-1',
              quantity: 1,
              sellerId: 'attacker-vendor',
              productName: 'Free Stuff',
              productSku: 'FAKE',
            } as unknown as OrderLineRequest,
          ],
          shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          vendorShippingFees: { 'real-vendor': 0 },
        },
        repo,
      );

      expect(order.items[0].productId).toBe('real-prod');
      expect(order.items[0].productSku).toBe('REAL-SKU');
      expect(order.items[0].productName).toBe('Real Product');
      expect(order.items[0].sellerId).toBe('real-vendor');
      expect(order.subOrders[0].sellerId).toBe('real-vendor');
    });

    it('clamps a discount larger than the cart so the total cannot go negative', async () => {
      stubVariant({ id: 'var-1', price: 10000, sellerId: 'vendor-A' });

      const order = await orderService.create(
        {
          userId: 'user-1',
          items: [{ productId: 'p1', variantId: 'var-1', quantity: 1 }],
          shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          vendorShippingFees: { 'vendor-A': 0 },
          discountAmount: 999999,
        },
        repo,
      );

      expect(order.discountAmount).toBe(10000);
      expect(order.totalAmount).toBe(0);
    });

    it('refuses a negative shipping fee rather than subtracting it from the total', async () => {
      stubVariant({ id: 'var-1', price: 10000, sellerId: 'vendor-A' });

      const order = await orderService.create(
        {
          userId: 'user-1',
          items: [{ productId: 'p1', variantId: 'var-1', quantity: 1 }],
          shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          vendorShippingFees: { 'vendor-A': -50000 },
        },
        repo,
      );

      expect(order.shippingFee).toBe(0);
      expect(order.totalAmount).toBe(10000);
    });

    it('rejects a non-positive or fractional quantity', async () => {
      stubVariant({ id: 'var-1', price: 10000 });
      const base = {
        userId: 'user-1',
        shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
      };

      for (const quantity of [0, -3, 1.5]) {
        await expect(
          orderService.create(
            { ...base, items: [{ productId: 'p1', variantId: 'var-1', quantity }] },
            repo,
          ),
        ).rejects.toMatchObject({ status: 422 });
      }
    });

    it('sums duplicate lines for one variant instead of reserving twice', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      const order = await orderService.create(
        {
          userId: 'user-1',
          items: [
            { productId: 'p1', variantId: 'var-1', quantity: 2 },
            { productId: 'p1', variantId: 'var-1', quantity: 3 },
          ],
          shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          vendorShippingFees: { 'vendor-A': 0 },
        },
        repo,
      );

      expect(reserveCalls).toEqual([{ variantId: 'var-1', quantity: 5 }]);
      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(5);
      expect(order.subtotal).toBe(5000);
    });
  });

  // ─── Inventory ──────────────────────────────────────────────────────────────

  // ── Order-creation idempotency ─────────────────────────────────────────────
  //
  // checkout-service's saga is re-drivable by design (confirmPayment re-runs it
  // end to end) and sends one stable sessionId per checkout. Before this,
  // nothing here checked it: a re-drive wrote a second order against a single
  // payment, so the customer paid once and was owed the goods twice.
  describe('creation idempotency (checkout session)', () => {
    const checkoutInput = (sessionId?: string): CreateOrderInput => ({
      userId: 'user-1',
      sessionId,
      items: [{ productId: 'p1', variantId: 'var-1', quantity: 1 }],
      shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
      vendorShippingFees: { 'vendor-A': 0 },
    });

    it('returns the original order when the same session is submitted twice', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      const first  = await orderService.create(checkoutInput('sess-1'), repo);
      const second = await orderService.create(checkoutInput('sess-1'), repo);

      expect(second.id).toBe(first.id);
      expect(second.orderNumber).toBe(first.orderNumber);
      const { data } = await repo.listByUser('user-1', 1, 50);
      expect(data).toHaveLength(1);
    });

    it('does not reserve stock again on the replay', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      await orderService.create(checkoutInput('sess-2'), repo);
      const afterFirst = reserveCalls.length;
      await orderService.create(checkoutInput('sess-2'), repo);

      // The replay short-circuits before the reservation step, so it must not
      // take — and then have to release — a second hold on the same stock.
      expect(reserveCalls).toHaveLength(afterFirst);
      expect(releaseCalls).toHaveLength(0);
    });

    it('still creates separate orders for different sessions', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      const a = await orderService.create(checkoutInput('sess-3'), repo);
      const b = await orderService.create(checkoutInput('sess-4'), repo);

      expect(b.id).not.toBe(a.id);
    });

    it('does not collide orders that carry no session id', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      // The index is sparse precisely so every direct-path order stays out of
      // it. That only works while the field is ABSENT: `checkoutSessionId: null`
      // is an indexed value, so writing one on every direct order meant the
      // second one ever created died on E11000. Reproduced against a real Mongo.
      const a = await orderService.create(checkoutInput(undefined), repo);
      const b = await orderService.create(checkoutInput(undefined), repo);

      expect(b.id).not.toBe(a.id);
      // Absent, not null — the distinction the index turns on.
      expect(a.checkoutSessionId).toBeUndefined();
      expect('checkoutSessionId' in a).toBe(false);
    });

    it('still records the session id on a checkout-driven order', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      const order = await orderService.create(checkoutInput('sess-kept'), repo);

      expect(order.checkoutSessionId).toBe('sess-kept');
    });

    it('returns the committed order when two re-drives race past the lookup', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      // Both callers observe "no existing order" before either writes — the
      // window the unique index exists to close. The loser must resolve to the
      // winner's order, not surface a duplicate-key error the saga would
      // interpret as a failed order and compensate by refunding a paid one.
      const [first, second] = await Promise.all([
        orderService.create(checkoutInput('sess-race'), repo),
        orderService.create(checkoutInput('sess-race'), repo),
      ]);

      expect(second.id).toBe(first.id);
      const { data } = await repo.listByUser('user-1', 1, 50);
      expect(data).toHaveLength(1);
    });
  });

  describe('inventory reservation', () => {
    it('reserves every line before the order is written', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });
      stubVariant({ id: 'var-2', price: 2000, sellerId: 'vendor-A' });

      const order = await orderService.create(
        {
          userId: 'user-1',
          items: [
            { productId: 'p1', variantId: 'var-2', quantity: 1 },
            { productId: 'p2', variantId: 'var-1', quantity: 4 },
          ],
          shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          vendorShippingFees: { 'vendor-A': 0 },
        },
        repo,
      );

      // Sorted by variantId so concurrent orders take row locks in one order.
      expect(reserveCalls).toEqual([
        { variantId: 'var-1', quantity: 4 },
        { variantId: 'var-2', quantity: 1 },
      ]);
      expect(await repo.findById(order.id)).not.toBeNull();
    });

    it('rejects with 409 and writes no order when stock runs out', async () => {
      stubVariant({ id: 'var-1', price: 1000, productName: 'Sugar', sellerId: 'vendor-A' });
      stubVariant({ id: 'var-2', price: 2000, productName: 'Salt',  sellerId: 'vendor-A' });
      outOfStock.add('var-2');

      await expect(
        orderService.create(
          {
            userId: 'user-1',
            items: [
              { productId: 'p1', variantId: 'var-1', quantity: 1 },
              { productId: 'p2', variantId: 'var-2', quantity: 1 },
            ],
            shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          },
          repo,
        ),
      ).rejects.toMatchObject({ status: 409, name: 'OutOfStockError' });

      expect(await repo.listRecent(10)).toHaveLength(0);
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('releases holds it already took when a later line is out of stock', async () => {
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });
      stubVariant({ id: 'var-2', price: 2000, sellerId: 'vendor-A' });
      outOfStock.add('var-2');

      await expect(
        orderService.create(
          {
            userId: 'user-1',
            items: [
              { productId: 'p1', variantId: 'var-1', quantity: 1 },
              { productId: 'p2', variantId: 'var-2', quantity: 1 },
            ],
            shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          },
          repo,
        ),
      ).rejects.toThrow();

      // var-1 was held before var-2 failed, so it must be handed back.
      expect(releaseCalls).toEqual([{ variantId: 'var-1', reservationId: 'res-var-1' }]);
    });

    it('reuses a reservation the caller already holds instead of taking a second', async () => {
      // This is checkout-service's saga: it reserved during RESERVE_INVENTORY
      // and passes the ids on to CREATE_ORDER.
      stubVariant({ id: 'var-1', price: 1000, sellerId: 'vendor-A' });

      const order = await orderService.create(
        {
          userId: 'user-1',
          sessionId: 'sess-9',
          items: [
            { productId: 'p1', variantId: 'var-1', quantity: 1, reservationId: 'saga-res-1' },
          ],
          shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          vendorShippingFees: { 'vendor-A': 0 },
        },
        repo,
      );

      expect(reserveCalls).toHaveLength(0);
      expect(order.subtotal).toBe(1000);
    });

    it('rejects a line whose variant is no longer sellable', async () => {
      // Nothing stubbed — the catalogue has no such variant.
      await expect(
        orderService.create(
          {
            userId: 'user-1',
            items: [{ productId: 'p1', variantId: 'delisted', quantity: 1 }],
            shipping: { address: 'Plot 1', city: 'Kampala', phone: '+256770000000' },
          },
          repo,
        ),
      ).rejects.toMatchObject({ status: 409, name: 'ItemUnavailableError' });

      expect(reserveCalls).toHaveLength(0);
      expect(await repo.listRecent(10)).toHaveLength(0);
    });
  });


  // ─── The transitions the seller dashboard is allowed to make ────────────────
  //
  // There was no state machine at all: `subOrder.status = newStatus` took
  // whatever arrived. Live against a real order, a seller could PATCH
  // "NOT_A_REAL_STATUS" and get a 200, or move a brand-new order to
  // 'delivered' — which publishes ORDER_DELIVERED and releases their escrow
  // payout for a parcel that had never left the shop.


  // ─── Cancelling gives the goods back ────────────────────────────────────────
  //
  // It did not. `cancel` flipped the order and its sub-orders to 'cancelled',
  // published order.cancelled, and stopped. inventory-service's consumer for
  // that event deliberately moves no stock — and could not anyway, since the
  // payload carries no variant ids — so the units this order had deducted were
  // simply gone. Live, a cancelled two-unit order left the catalogue two units
  // short with nothing recording where they went.


  // ─── A parcel gets a delivery job when the seller accepts it ────────────────
  //
  // fulfillment-service had a complete rider and cash-on-delivery domain and no
  // way for a parcel to arrive in it: every job had to be booked by hand. The
  // trigger is the move to 'processing' — the first moment a parcel is real.
  // Earlier is premature (a pending order may still be cancelled), later means
  // no rider can be dispatched until the seller has already handed it over.

  describe('booking the delivery job', () => {
    async function subOrderFor(sellerId = 'vendor-A') {
      stubVariant({ id: 'var-tea', productId: 'prod-1', sku: 'TEA-001', price: 10000, productName: 'Tea', sellerId });
      const order = await orderService.create({
        userId: 'user-456',
        items: [{ productId: 'prod-1', variantId: 'var-tea', quantity: 1 }],
        shipping: { address: 'Jinja Rd', city: 'Kampala', phone: '+256780000000' },
      }, repo);
      return order.subOrders[0];
    }

    const move = (id: string, status: string, seller = 'vendor-A') =>
      orderService.updateSubOrderStatus(id, seller, status as SubOrderStatus, undefined, repo);

    it('books one when the seller accepts', async () => {
      const sub = await subOrderFor();
      await move(sub.id, 'processing');

      expect(bookedJobs).toHaveLength(1);
      expect(bookedJobs[0]).toMatchObject({ subOrderId: sub.id, sellerId: 'vendor-A' });
    });

    it('books nothing while the order is still pending', async () => {
      await subOrderFor();
      expect(bookedJobs).toHaveLength(0);
    });

    it('books nothing for an order the seller cancels instead', async () => {
      const sub = await subOrderFor();
      await move(sub.id, 'cancelled');

      expect(bookedJobs).toHaveLength(0);
    });

    it('books nothing more as the parcel moves on through the lane', async () => {
      const sub = await subOrderFor();
      await move(sub.id, 'processing');
      for (const s of ['picked_up', 'in_transit', 'out_for_delivery', 'delivered']) await move(sub.id, s);

      expect(bookedJobs).toHaveLength(1);
    });

    it('books one job per seller on a multi-seller order', async () => {
      stubVariant({ id: 'var-tea',    productId: 'prod-1', sku: 'TEA-001', price: 10000, productName: 'Tea',    sellerId: 'vendor-A' });
      stubVariant({ id: 'var-coffee', productId: 'prod-2', sku: 'COF-001', price: 20000, productName: 'Coffee', sellerId: 'vendor-B' });

      const order = await orderService.create({
        userId: 'user-456',
        items: [
          { productId: 'prod-1', variantId: 'var-tea',    quantity: 1 },
          { productId: 'prod-2', variantId: 'var-coffee', quantity: 1 },
        ],
        shipping: { address: 'Jinja Rd', city: 'Kampala', phone: '+256780000000' },
      }, repo);

      const a = order.subOrders.find((s) => s.sellerId === 'vendor-A')!;
      const b = order.subOrders.find((s) => s.sellerId === 'vendor-B')!;

      // Each seller accepts independently, which is the whole point of the split.
      await move(a.id, 'processing', 'vendor-A');
      expect(bookedJobs).toHaveLength(1);

      await move(b.id, 'processing', 'vendor-B');
      expect(bookedJobs).toHaveLength(2);
      expect(bookedJobs.map((j) => j.sellerId).sort()).toEqual(['vendor-A', 'vendor-B']);
    });

    it('still accepts the order when fulfillment-service is unreachable', async () => {
      // A seller must not be blocked from accepting their own order because a
      // downstream service is redeploying. The failure is logged for redispatch.
      mockBookDeliveryJob.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const sub = await subOrderFor();

      const updated = await move(sub.id, 'processing');
      expect(updated.status).toBe('processing');
    });

    it('re-sending processing does not book a second job for the same parcel', async () => {
      const sub = await subOrderFor();
      await move(sub.id, 'processing');
      await move(sub.id, 'processing');

      // The no-op transition short-circuits; fulfillment-service is keyed on
      // subOrderId with a unique index besides, so a retry that does reach it
      // returns the existing job.
      expect(bookedJobs).toHaveLength(1);
    });
  });

  describe('cancelling an order returns its stock', () => {
    async function placedOrder(quantity = 2) {
      stubVariant({ id: 'var-tea', productId: 'prod-1', sku: 'TEA-001', price: 10000, productName: 'Tea', sellerId: 'vendor-A' });
      return orderService.create({
        userId: 'user-456',
        items: [{ productId: 'prod-1', variantId: 'var-tea', quantity }],
        shipping: { address: 'Jinja Rd', city: 'Kampala', phone: '+256780000000' },
      }, repo);
    }

    it('puts every unit back on the shelf', async () => {
      const order = await placedOrder(2);
      await orderService.cancel(order.id, 'user-456', 'changed my mind', repo);

      expect(restoreCalls).toEqual([{ variantId: 'var-tea', quantity: 2 }]);
    });

    it('restores each line of a multi-line order', async () => {
      stubVariant({ id: 'var-tea',    productId: 'prod-1', sku: 'TEA-001', price: 10000, productName: 'Tea',    sellerId: 'vendor-A' });
      stubVariant({ id: 'var-coffee', productId: 'prod-2', sku: 'COF-001', price: 20000, productName: 'Coffee', sellerId: 'vendor-B' });

      const order = await orderService.create({
        userId: 'user-456',
        items: [
          { productId: 'prod-1', variantId: 'var-tea',    quantity: 3 },
          { productId: 'prod-2', variantId: 'var-coffee', quantity: 1 },
        ],
        shipping: { address: 'Jinja Rd', city: 'Kampala', phone: '+256780000000' },
      }, repo);

      await orderService.cancel(order.id, 'user-456', 'changed my mind', repo);

      expect(restoreCalls).toHaveLength(2);
      expect(restoreCalls).toEqual(expect.arrayContaining([
        { variantId: 'var-tea', quantity: 3 },
        { variantId: 'var-coffee', quantity: 1 },
      ]));
    });

    it('still cancels the order when inventory-service cannot be reached', async () => {
      // The customer's cancellation and refund must not hinge on a derived
      // stock update. The failure is logged for manual correction instead.
      mockRestoreStock.mockRejectedValueOnce(new Error('inventory unreachable'));
      const order = await placedOrder(1);

      const cancelled = await orderService.cancel(order.id, 'user-456', 'changed my mind', repo);
      expect(cancelled.status).toBe('cancelled');
    });

    it('returns nothing for an order it refuses to cancel', async () => {
      const order = await placedOrder(1);
      await orderService.cancel(order.id, 'user-456', 'first time', repo);
      restoreCalls.length = 0;

      // Already cancelled — a second attempt must not hand the stock back twice.
      await expect(orderService.cancel(order.id, 'user-456', 'again', repo))
        .rejects.toMatchObject({ status: 409 });
      expect(restoreCalls).toHaveLength(0);
    });

    it('returns nothing to a stranger who cannot cancel it', async () => {
      const order = await placedOrder(1);

      await expect(orderService.cancel(order.id, 'someone-else', 'not mine', repo))
        .rejects.toMatchObject({ status: 404 });
      expect(restoreCalls).toHaveLength(0);
    });
  });

  describe('sub-order status transitions', () => {
    async function freshSubOrder() {
      stubVariant({ id: 'var-tea', productId: 'prod-1', sku: 'TEA-001', price: 10000, productName: 'Tea', sellerId: 'vendor-A' });
      const order = await orderService.create({
        userId: 'user-456',
        items: [{ productId: 'prod-1', variantId: 'var-tea', quantity: 1 }],
        shipping: { address: 'Jinja Rd', city: 'Kampala', phone: '+256780000000' },
      }, repo);
      return order.subOrders[0];
    }

    const move = (id: string, status: string) =>
      orderService.updateSubOrderStatus(id, 'vendor-A', status as SubOrderStatus, undefined, repo);

    it('refuses a status this service has never heard of', async () => {
      const sub = await freshSubOrder();
      await expect(move(sub.id, 'NOT_A_REAL_STATUS')).rejects.toMatchObject({ status: 400 });
    });

    it('refuses a jump from a new order straight to delivered', async () => {
      const sub = await freshSubOrder();
      await expect(move(sub.id, 'delivered')).rejects.toMatchObject({ status: 400 });
    });

    it('publishes no delivery event for a refused jump, so no payout is released', async () => {
      const sub = await freshSubOrder();
      mockPublish.mockClear();

      await move(sub.id, 'delivered').catch(() => undefined);

      const delivered = mockPublish.mock.calls.filter(
        (args) => String((args as unknown[])[0]).includes('deliver'),
      );
      expect(delivered).toHaveLength(0);
    });

    it('leaves the stored status untouched when a transition is refused', async () => {
      const sub = await freshSubOrder();
      await move(sub.id, 'delivered').catch(() => undefined);

      const after = await repo.findOrderContainingSubOrder(sub.id);
      expect(after?.subOrders.find((s) => s.id === sub.id)?.status).toBe('pending');
    });

    it('allows the ordinary fulfilment path one step at a time', async () => {
      const sub = await freshSubOrder();
      for (const status of ['processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered']) {
        const updated = await move(sub.id, status);
        expect(updated.status).toBe(status);
      }
    });


    it('lets a rider collect a parcel the seller has not marked processing', async () => {
      // Stage 8: fulfillment-service projects a rider's pickup onto this
      // sub-order. A rider can claim a package that is still PENDING, so a
      // table demanding 'processing' first rejected every real collection and
      // left the customer's order reading 'pending' while it was on a bike.
      const sub = await freshSubOrder();
      await expect(move(sub.id, 'picked_up')).resolves.toMatchObject({ status: 'picked_up' });
    });

    it('still refuses delivered straight from pending', async () => {
      // The protection the table exists for, unchanged by the above.
      const sub = await freshSubOrder();
      await expect(move(sub.id, 'delivered')).rejects.toMatchObject({ status: 400 });
    });

    it('refuses to walk a delivered order backwards', async () => {
      const sub = await freshSubOrder();
      for (const status of ['processing', 'picked_up', 'delivered']) await move(sub.id, status);

      await expect(move(sub.id, 'pending')).rejects.toMatchObject({ status: 400 });
      await expect(move(sub.id, 'processing')).rejects.toMatchObject({ status: 400 });
    });

    it('refuses to cancel a consignment already with a carrier', async () => {
      const sub = await freshSubOrder();
      await move(sub.id, 'processing');
      await move(sub.id, 'picked_up');

      // Past this point the way out is a return, not a cancellation.
      await expect(move(sub.id, 'cancelled')).rejects.toMatchObject({ status: 400 });
    });

    it('still allows cancelling one that has not moved', async () => {
      const sub = await freshSubOrder();
      const updated = await move(sub.id, 'cancelled');
      expect(updated.status).toBe('cancelled');
    });

    it('treats re-sending the current status as a no-op rather than an error', async () => {
      const sub = await freshSubOrder();
      await move(sub.id, 'processing');
      const again = await move(sub.id, 'processing');
      expect(again.status).toBe('processing');
    });

    it('refuses another seller before it considers the transition at all', async () => {
      const sub = await freshSubOrder();
      await expect(
        orderService.updateSubOrderStatus(sub.id, 'vendor-B', 'processing', undefined, repo),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('updateSubOrderStatus', () => {
    it('updates sub-order status and triggers delivered Kafka event when status is delivered', async () => {
      stubVariant({ id: 'var-tea', productId: 'prod-1', sku: 'TEA-001', price: 10000, productName: 'Tea', sellerId: 'vendor-A' });

      const input: CreateOrderInput = {
        userId: 'user-456',
        items: [{ productId: 'prod-1', variantId: 'var-tea', quantity: 1 }],
        shipping: { address: 'Jinja Rd', city: 'Kampala', phone: '+256780000000' },
      };

      const masterOrder = await orderService.create(input, repo);
      const subOrder = masterOrder.subOrders[0];

      // Walked, not jumped. This used to go straight from 'pending' to
      // 'delivered' in one call — which is what the service allowed, and what
      // let a seller trigger their own payout on a parcel that never shipped.
      const advance = (status: SubOrderStatus, meta?: Record<string, string>) =>
        orderService.updateSubOrderStatus(subOrder.id, 'vendor-A', status, meta, repo);

      await advance('processing');
      await advance('picked_up', { trackingNumber: 'TRK-999', carrier: 'MUNI Logistics' });
      await advance('in_transit');
      await advance('out_for_delivery');
      const updated = await advance('delivered');

      expect(updated.status).toBe('delivered');
      expect(updated.trackingNumber).toBe('TRK-999');
      expect(mockPublish).toHaveBeenCalledWith(
        'order-events',
        expect.objectContaining({
          subOrderId: subOrder.id,
          sellerId: 'vendor-A',
        }),
        'vendor-A'
      );
    });
  });
});
