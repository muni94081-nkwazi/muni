import { randomUUID } from 'node:crypto';
import { fetchProduct } from '../clients/catalog.client.js';

// ─── Wholesale ────────────────────────────────────────────────────────────────
//
// Tiers are percentages off a product's catalogue price, so the base figure
// decides every price in the table. It used to arrive as a function argument
// defaulting to 4_200_000 — meaning a caller who passed `basePrice: 1` got a
// tier table where 100 units cost 75 shillings. The base is now read from
// product-service and the parameter is gone, so there is no way to supply one.

export interface BulkDiscountTier {
  minQty: number;
  maxQty?: number;
  discountPercent: number;
  unitPrice: number;
}

export interface WholesaleOrder {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  totalPrice: number;
  status: 'PENDING' | 'APPROVED' | 'DISPATCHED' | 'DELIVERED';
  createdAt: string;
}

const wholesaleOrdersStore = new Map<string, WholesaleOrder>();

/** Tier structure. Percentages only — the money comes from the catalogue. */
const TIER_BANDS: Array<{ minQty: number; maxQty?: number; discountPercent: number }> = [
  { minQty: 1,   maxQty: 9,  discountPercent: 0  },
  { minQty: 10,  maxQty: 49, discountPercent: 10 },
  { minQty: 50,  maxQty: 99, discountPercent: 18 },
  { minQty: 100,             discountPercent: 25 },
];

export class InvalidWholesaleRequestError extends Error {
  readonly status = 422;
  constructor(message: string) { super(message); this.name = 'InvalidWholesaleRequestError'; }
}

function buildTiers(basePrice: number): BulkDiscountTier[] {
  return TIER_BANDS.map((band) => ({
    ...band,
    unitPrice: Math.round(basePrice * (1 - band.discountPercent / 100)),
  }));
}

export class WholesaleService {
  /** Tiers for a product, priced from the catalogue. */
  async getWholesaleTiers(productId: string, actorId?: string): Promise<BulkDiscountTier[]> {
    const product = await fetchProduct(productId, actorId);
    return buildTiers(product.basePrice);
  }

  async createWholesaleOrder(userId: string, productId: string, quantity: number): Promise<WholesaleOrder> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new InvalidWholesaleRequestError('Quantity must be a whole number of at least 1.');
    }

    const product = await fetchProduct(productId, userId);
    const tiers   = buildTiers(product.basePrice);

    // `.reverse()` mutates in place, so the original array was left reversed
    // for anything reading it afterwards. Copy first, then search highest-band
    // down for the one this quantity qualifies for.
    const applicableTier = [...tiers].reverse().find((t) => quantity >= t.minQty) ?? tiers[0];

    const unitPrice = applicableTier.unitPrice;
    const totalPrice = unitPrice * quantity;

    const order: WholesaleOrder = {
      id: `WS-${randomUUID().slice(0, 8).toUpperCase()}`,
      userId,
      productId,
      quantity,
      unitPrice,
      discountPercentage: applicableTier.discountPercent,
      totalPrice,
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
    };

    wholesaleOrdersStore.set(order.id, order);
    return order;
  }

  /**
   * A buyer's own wholesale orders.
   *
   * Scoped by userId rather than returning the store, so one buyer's bulk
   * pricing and volumes are not visible to another.
   */
  async listWholesaleOrders(userId: string): Promise<WholesaleOrder[]> {
    return [...wholesaleOrdersStore.values()]
      .filter((order) => order.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export const wholesaleService = new WholesaleService();
