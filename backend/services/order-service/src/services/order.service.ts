import { randomUUID } from 'node:crypto';
import type {
  Order,
  OrderItem,
  MasterOrderStatus,
  SubOrder,
  SubOrderStatus,
  ShippingDetails
} from '../models/order.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';
import { publishEvent, ROUTING_KEYS } from '../../../../shared/rabbitmq/index.js';
import { orderRepository } from '../repositories/order.repository.js';
import type { IOrderRepository, AdminOrderFilters, AdminOrderStats } from '../repositories/order.repository.js';
import {
  fetchVariant,
  reserveStock,
  releaseStock,
  restoreStock,
  type CatalogVariant,
} from '../clients/catalog.client.js';
import { bookDeliveryJob, BOOK_JOB_AT_STATUS } from '../clients/fulfillment.client.js';
import { logger } from '../utils/logger.js';

/**
 * True for MongoDB's duplicate-key error (E11000).
 *
 * Structural check rather than a message match: the driver surfaces `code`
 * numerically and the human text varies by server version. Kept narrow on
 * purpose — anything else must still propagate as a real failure.
 */
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

export const MASTER_STATUS_LABELS: Record<MasterOrderStatus, string> = {
  pending:            'Pending Payment',
  payment_processing: 'Processing Payment',
  paid:               'Payment Paid',
  payment_confirmed:  'Payment Confirmed',
  processing:         'Processing Order',
  completed:          'Completed',
  cancelled:          'Cancelled',
  payment_failed:     'Payment Failed',
  refunded:           'Refunded',
};

export const SUB_STATUS_LABELS: Record<SubOrderStatus, string> = {
  pending:           'Order Placed',
  payment_confirmed: 'Payment Confirmed',
  processing:        'Preparing Items',
  picked_up:         'Picked Up by Carrier',
  in_transit:        'In Transit',
  out_for_delivery:  'Out for Delivery',
  delivered:         'Delivered',
  cancelled:         'Cancelled',
  refunded:          'Refunded',
};

// ─── Which status may follow which ────────────────────────────────────────────
//
// There was no such rule. `updateSubOrderStatus` assigned whatever arrived:
//
//   • any string at all — "NOT_A_REAL_STATUS" was accepted with a 200 and
//     written to the order, where it rendered as an undefined label;
//   • any jump — a seller could move a brand-new order straight to
//     'delivered', which publishes ORDER_DELIVERED and releases their escrow
//     payout. They were paid for a parcel that had never been shipped;
//   • any reversal — 'delivered' back to 'pending', re-opening a closed order
//     and, with it, the returns and refund windows keyed off delivery.
//
// The lane below is the fulfilment path a real consignment takes. 'cancelled'
// is reachable only while nothing has physically moved; once a parcel is with a
// carrier the way out is a return, not a cancellation. 'delivered' and
// 'refunded' are terminal — the seller has no further say from here.
const SUB_STATUS_TRANSITIONS: Record<SubOrderStatus, readonly SubOrderStatus[]> = {
  // 'picked_up' is reachable from the three pre-dispatch states because a
  // rider collecting a parcel is a real event that does not wait for the seller
  // to click anything. fulfillment-service lets a rider claim a package in
  // PENDING, ASSIGNED, PICKING, PACKED or HANDED_TO_CARRIER (its
  // CLAIMABLE_STATUSES), and Stage 8 made that rider's pickup project onto this
  // sub-order — so a table that demanded 'processing' first rejected every real
  // collection and left the customer's order reading 'pending' while the parcel
  // was already on a motorcycle.
  //
  // The protection this table exists for is untouched: 'delivered' is still
  // reachable only from a state that means the parcel has physically moved.
  pending:           ['payment_confirmed', 'processing', 'picked_up', 'cancelled'],
  payment_confirmed: ['processing', 'picked_up', 'cancelled'],
  processing:        ['picked_up', 'cancelled'],
  picked_up:         ['in_transit', 'out_for_delivery', 'delivered'],
  in_transit:        ['out_for_delivery', 'delivered'],
  out_for_delivery:  ['delivered'],
  delivered:         ['refunded'],
  cancelled:         ['refunded'],
  refunded:          [],
};

/** A status this service recognises at all — not merely a non-empty string. */
export function isSubOrderStatus(value: unknown): value is SubOrderStatus {
  return typeof value === 'string' && Object.hasOwn(SUB_STATUS_TRANSITIONS, value);
}

export class InvalidStatusError extends Error {
  readonly status = 400;
  constructor(message: string) { super(message); this.name = 'InvalidStatusError'; }
}

function generateSubOrderNumber(masterNumber: string, index: number): string {
  const char = String.fromCharCode(65 + index); // 'A', 'B', 'C'
  return `${masterNumber}-${char}`;
}

/**
 * What a caller may ask for: which variant, and how many.
 *
 * Deliberately NOT `CartItem`. A caller that sends `unitPrice`, `lineTotal`,
 * `sellerId` or `productName` has those fields ignored — every one of them is
 * re-derived from the catalogue in `create()`. The narrow type is the first
 * line of defence; `sanitizeLine()` below is the one that actually holds,
 * since TypeScript cannot police a JSON body at runtime.
 */
export interface OrderLineRequest {
  /**
   * Optional, and never used to price anything — the authoritative productId
   * comes back from product-service with the variant. Accepted only because
   * callers naturally send it.
   */
  productId?: string;
  variantId:  string;
  quantity:   number;
  /**
   * Set only by checkout-service's saga, which has already taken a TTL hold on
   * this line via inventory-service. When present the order is written against
   * the existing hold instead of taking a second one; when absent we reserve
   * here, so a direct `POST /orders` cannot oversell.
   */
  reservationId?: string;
}

export interface CreateOrderInput {
  userId: string;
  items: OrderLineRequest[];
  shipping: {
    address:       string;
    city:          string;
    district?:     string;
    phone:         string;
    notes?:        string;
    shipping_fee?: number;
  };
  paymentMethod?:   string;
  couponCode?:      string;
  discountAmount?:  number;
  vendorShippingFees?: Record<string, number>; // sellerId -> shipping fee
  /**
   * sellerId -> discount, the binding allocation checkout computed from the
   * basket it priced. Recorded as given: this service validates it but does
   * not invent its own split, because only checkout knows which items the
   * coupon was actually eligible against.
   */
  vendorDiscounts?: Record<string, number>;
  /**
   * sellerId -> tax, from checkout. order-service had no tax concept at all:
   * both the master order and every sub-order hardcoded 0, so a checkout that
   * collected tax recorded an order total short by exactly that amount.
   */
  vendorTaxes?: Record<string, number>;
  commissionRate?:  number; // e.g. 0.125 (12.5% platform fee, 87.5% seller share)
  /** Correlates reservations with the checkout that took them. */
  sessionId?:       string;
}

export class InvalidOrderError extends Error {
  readonly status = 422;
  constructor(message: string) { super(message); this.name = 'InvalidOrderError'; }
}

/** Money is rounded to 2dp at every boundary so cents cannot drift. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Coerce a caller-supplied monetary field, falling back when it is missing or
 * not a finite number. Guards against `NaN`/`Infinity` propagating into a
 * total — `undefined` arithmetic is how the previous version produced orders
 * with a `NaN` value.
 */
function toMoney(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Reduce an untrusted request line to the only three things a caller is
 * allowed to choose. Anything else on the object — prices above all — is
 * dropped here and never reaches the rest of the function.
 */
function sanitizeLine(raw: unknown): OrderLineRequest {
  const line = (raw ?? {}) as Record<string, unknown>;

  const productId = typeof line.productId === 'string' ? line.productId : '';
  const variantId = typeof line.variantId === 'string' ? line.variantId : '';
  const quantity  = Number(line.quantity);

  if (!variantId) {
    throw new InvalidOrderError('Every order line must identify a product variant.');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new InvalidOrderError('Each line must have a whole quantity between 1 and 1000.');
  }

  return {
    productId,
    variantId,
    quantity,
    ...(typeof line.reservationId === 'string' && line.reservationId
      ? { reservationId: line.reservationId }
      : {}),
  };
}

// ─── Create Master Order + Sub-Orders ─────────────────────────────────────────

export async function create(
  input: CreateOrderInput,
  repo: IOrderRepository = orderRepository,
): Promise<Order> {
  const now = new Date().toISOString();
  const masterOrderId = randomUUID();
  const defaultCommissionRate = input.commissionRate ?? 0.125; // 12.5% platform commission

  // ── 0. Order-creation idempotency ───────────────────────────────────────
  //
  // checkout-service's saga is explicitly re-drivable (confirmPayment re-runs
  // it end to end) and sends one stable key per checkout. Nothing here checked
  // it, so a re-drive priced, held stock for, and wrote a SECOND order against
  // a single payment — the customer paid once and owed goods twice.
  //
  // Checked before any stock is held so a repeat call does not take a fresh
  // reservation it would then have to release. The unique sparse index on
  // checkoutSessionId is the actual guarantee (see the E11000 handler at the
  // write below); this lookup is the cheap path that avoids the race entirely
  // in the common, sequential case.
  if (input.sessionId) {
    const existing = await repo.findByCheckoutSessionId(input.sessionId);
    if (existing) {
      logger.info('[order] returning existing order for checkout session (idempotent replay)', {
        detail: { orderId: existing.id, sessionId: input.sessionId },
      });
      return existing;
    }
  }

  // ── 1. Reduce the request to variant + quantity ─────────────────────────
  // Everything monetary the caller sent is discarded here, before it can be
  // read by anything downstream. Validation lives in the service rather than
  // only in the controller so a future caller cannot reach the money path by
  // skipping a route.
  const requested = (Array.isArray(input.items) ? input.items : []).map(sanitizeLine);
  if (requested.length === 0) {
    throw new InvalidOrderError('An order needs at least one item.');
  }

  if (!input.shipping?.address || !input.shipping.city || !input.shipping.phone) {
    throw new InvalidOrderError('A delivery address, city and phone number are required.');
  }

  // Collapse duplicate lines for the same variant so two entries cannot each
  // reserve separately and slip past the per-line stock check.
  const byVariant = new Map<string, OrderLineRequest>();
  for (const line of requested) {
    const existing = byVariant.get(line.variantId);
    if (existing) {
      existing.quantity += line.quantity;
      existing.reservationId ??= line.reservationId;
    } else {
      byVariant.set(line.variantId, { ...line });
    }
  }

  // Sorted so every concurrent order takes inventory row locks in the same
  // order — two carts holding {A,B} and {B,A} would otherwise deadlock.
  const lines = [...byVariant.values()].sort((a, b) => a.variantId.localeCompare(b.variantId));

  // ── 2. Price every line from the catalogue ──────────────────────────────
  const priced: Array<{ line: OrderLineRequest; variant: CatalogVariant }> = [];
  for (const line of lines) {
    const variant = await fetchVariant(line.variantId, input.userId);
    priced.push({ line, variant });
  }

  // ── 3. Hold stock before anything is written ────────────────────────────
  // Lines that arrive with a reservationId were already held by the caller
  // (checkout-service's saga); the rest are held here. Anything we take is
  // released if a later line fails, so a rejected order leaves no stock stuck.
  const takenHere: Array<{ variantId: string; reservationId: string }> = [];
  const reservationByVariant = new Map<string, string>();
  const sessionId = input.sessionId ?? masterOrderId;

  try {
    for (const { line, variant } of priced) {
      if (line.reservationId) {
        reservationByVariant.set(line.variantId, line.reservationId);
        continue;
      }
      const reservationId = await reserveStock(
        line.variantId,
        line.quantity,
        sessionId,
        variant.productName,
        input.userId,
      );
      takenHere.push({ variantId: line.variantId, reservationId });
      reservationByVariant.set(line.variantId, reservationId);
    }
  } catch (err) {
    await Promise.all(
      takenHere.map((held) => releaseStock(held.variantId, held.reservationId, input.userId)),
    );
    throw err;
  }

  // Only now — past every check that can reject the order — do we burn an
  // order number, so a failed attempt does not leave a gap in the sequence.
  const masterOrderNumber = await repo.nextOrderNumber();

  // ── 4. Group by the catalogue's seller, not the caller's ────────────────
  const itemsBySeller = new Map<string, Array<{ line: OrderLineRequest; variant: CatalogVariant }>>();
  for (const entry of priced) {
    const sellerId = entry.variant.sellerId || 'muni-store';
    if (!itemsBySeller.has(sellerId)) {
      itemsBySeller.set(sellerId, []);
    }
    itemsBySeller.get(sellerId)!.push(entry);
  }

  const subOrders: SubOrder[] = [];
  const allOrderItems: OrderItem[] = [];
  let calculatedSubtotal = 0;
  let totalShippingFee = 0;
  /** What each sub-order actually took, after its own clamp. */
  const appliedVendorDiscounts = new Map<string, number>();
  let totalTax = 0;
  let sellerIndex = 0;

  for (const [sellerId, sellerItems] of itemsBySeller.entries()) {
    const subOrderId = randomUUID();
    const subOrderNumber = generateSubOrderNumber(masterOrderNumber, sellerIndex++);

    // Every field here comes from `variant` — the catalogue's answer — except
    // `quantity`, the one thing the customer legitimately chooses.
    const subOrderItems: OrderItem[] = sellerItems.map(({ line, variant }) => {
      const orderItem: OrderItem = {
        id:              randomUUID(),
        productId:       variant.productId,
        variantId:       variant.id,
        sellerId:        sellerId,
        vendorId:        sellerId,
        productName:     variant.productName,
        productSku:      variant.sku,
        productImageUrl: variant.images?.[0] ?? null,
        unitPrice:       round2(variant.price),
        quantity:        line.quantity,
        lineTotal:       round2(variant.price * line.quantity),
        weightKg:        variant.weightKg ?? undefined,
        // Carried so settlement can deduct exactly this hold later.
        reservationId:   reservationByVariant.get(variant.id),
      };
      allOrderItems.push(orderItem);
      return orderItem;
    });

    const subOrderSubtotal = round2(subOrderItems.reduce((sum, item) => sum + item.lineTotal, 0));
    calculatedSubtotal = round2(calculatedSubtotal + subOrderSubtotal);

    // Clamped non-negative: a caller sending a negative fee would otherwise
    // subtract it straight off the order total.
    const sellerShippingFee = round2(
      Math.max(0, toMoney(input.vendorShippingFees?.[sellerId] ?? input.shipping.shipping_fee, 5000)),
    );
    totalShippingFee = round2(totalShippingFee + sellerShippingFee);

    // Tax this seller's share of the basket attracted. Zero when the caller
    // sends none, so the direct order path behaves exactly as it did.
    const sellerTax = round2(Math.max(0, toMoney(input.vendorTaxes?.[sellerId] ?? 0, 0)));
    totalTax = round2(totalTax + sellerTax);

    // This seller's own slice of the coupon, never a share of the whole.
    // Clamped to their goods so a bad allocation cannot drive a sub-order
    // negative, and defaulted to 0 so a caller that sends no breakdown (the
    // direct order path) behaves exactly as it did before.
    const sellerDiscount = round2(
      Math.min(Math.max(0, toMoney(input.vendorDiscounts?.[sellerId] ?? 0, 0)), subOrderSubtotal),
    );
    appliedVendorDiscounts.set(sellerId, sellerDiscount);

    const netSubtotal = round2(subOrderSubtotal - sellerDiscount);

    // Commission is charged on what the seller actually realises, so the
    // platform and the seller carry the promotion in the same proportion they
    // split the sale. Charging it on the gross instead would make the seller
    // fund the whole discount; charging nothing would make the platform fund
    // it, which is what happened while every sub-order carried a hardcoded
    // zero discount and a gross vendorShare.
    const platformCommission = Math.round(netSubtotal * defaultCommissionRate);
    const vendorShare = round2(netSubtotal - platformCommission);

    const subOrder: SubOrder = {
      id:                 subOrderId,
      subOrderNumber:     subOrderNumber,
      masterOrderId:      masterOrderId,
      sellerId:           sellerId,
      sellerName:         `Vendor ${sellerId}`,
      status:             'pending',
      statusLabel:        SUB_STATUS_LABELS.pending,
      items:              subOrderItems,
      subtotal:           subOrderSubtotal,
      shippingFee:        sellerShippingFee,
      taxAmount:          sellerTax,
      discountAmount:     sellerDiscount,
      totalAmount:        round2(netSubtotal + sellerShippingFee + sellerTax),
      vendorShare:        vendorShare,
      platformCommission: platformCommission,
      placedAt:           now,
      shippedAt:          null,
      deliveredAt:        null,
      cancelledAt:        null,
      updatedAt:          now,
    };

    subOrders.push(subOrder);
  }

  // Clamped into [0, subtotal]. An unclamped discount larger than the cart
  // produces a negative total, which downstream reads as a refund owed.
  //
  // When checkout supplied a per-seller allocation, the master figure is the
  // sum of what the sub-orders actually took. Anything else would leave
  // `sum(subOrder.totalAmount) !== master.totalAmount` — which is exactly the
  // gap that existed while the master carried the discount and every
  // sub-order carried zero.
  const allocated = round2(
    [...appliedVendorDiscounts.values()].reduce((sum, v) => sum + v, 0),
  );
  const requestedDiscount = round2(
    Math.min(Math.max(0, toMoney(input.discountAmount, 0)), calculatedSubtotal),
  );
  const discountAmount = input.vendorDiscounts ? allocated : requestedDiscount;

  if (input.vendorDiscounts && allocated !== requestedDiscount) {
    // Recorded, not corrected: order-service applies the allocation it was
    // given rather than inventing a different one. A mismatch means checkout
    // and this service disagree about the basket, which reconciliation needs
    // to see rather than have quietly smoothed over.
    logger.warn('[order] per-seller discounts do not sum to the requested total', {
      detail: { requested: requestedDiscount, allocated, orderId: masterOrderId },
    });
  }
  const totalAmount = round2(
    Math.max(0, calculatedSubtotal + totalShippingFee + totalTax - discountAmount),
  );

  const shipping: ShippingDetails = {
    address:  input.shipping.address,
    city:     input.shipping.city,
    district: input.shipping.district ?? null,
    phone:    input.shipping.phone,
    notes:    input.shipping.notes ?? null,
  };

  const masterOrder: Order = {
    id:                 masterOrderId,
    orderNumber:        masterOrderNumber,
    userId:             input.userId,
    status:             'pending',
    statusLabel:        MASTER_STATUS_LABELS.pending,
    subtotal:           calculatedSubtotal,
    shippingFee:        totalShippingFee,
    // The sum of what the sub-orders carry, so the master and its parts agree.
    taxAmount:          totalTax,
    discountAmount:     discountAmount,
    couponCode:         input.couponCode ?? null,
    totalAmount:        totalAmount,
    currency:           'UGX',
    paymentMethod:      input.paymentMethod ?? null,
    paymentReference:   null,
    shipping:           shipping,
    items:              allOrderItems,
    subOrders:          subOrders,
    itemCount:          allOrderItems.length,
    placedAt:           now,
    paidAt:             null,
    shippedAt:          null,
    deliveredAt:        null,
    cancelledAt:        null,
    cancellationReason: null,
    createdAt:          now,
    updatedAt:          now,
    // A caller that supplied its own reservation ids is checkout-service's
    // saga, which deducts them itself. Anything else is the direct path and
    // order-service settles it on payment confirmation.
    settlementPath:     lines.some((line) => line.reservationId) ? 'saga' : 'direct',
    inventorySettledAt: null,
    // Only set for checkout-driven orders. `input.sessionId` (not the
    // `sessionId` local above, which falls back to masterOrderId for the
    // direct path) — writing that fallback would put a unique value on every
    // direct order and make the sparse index pointless.
    //
    // OMITTED entirely on the direct path rather than written as null. A sparse
    // index skips a document only when the field is ABSENT; an explicit null is
    // indexed like any other value, so `?? null` put every direct order under
    // the same key and the second one ever created died on E11000. Reproduced
    // against a real Mongo before this change.
    ...(input.sessionId ? { checkoutSessionId: input.sessionId } : {}),
  };

  // If the write itself fails, hand back any stock this request was holding
  // rather than leaving it locked until the reservation TTL lapses. Holds the
  // caller passed in are left alone — they belong to the caller's own saga,
  // which has its own compensation for them.
  let created: Order;
  try {
    created = await repo.create(masterOrder);
  } catch (err) {
    // Two re-drives of the same checkout raced past the step-0 lookup and both
    // reached the write. The unique sparse index on checkoutSessionId let
    // exactly one through; this is the loser, so hand back the winner rather
    // than surfacing a duplicate-key error the caller cannot act on. Without
    // this the saga would treat a 500 here as a failed order and compensate —
    // refunding a payment for an order that does in fact exist.
    if (input.sessionId && isDuplicateKeyError(err)) {
      const winner = await repo.findByCheckoutSessionId(input.sessionId);
      if (winner) {
        await Promise.all(
          takenHere.map((held) => releaseStock(held.variantId, held.reservationId, input.userId)),
        );
        logger.warn('[order] concurrent create for one checkout session — returning the committed order', {
          detail: { orderId: winner.id, sessionId: input.sessionId },
        });
        return winner;
      }
    }

    await Promise.all(
      takenHere.map((held) => releaseStock(held.variantId, held.reservationId, input.userId)),
    );
    throw err;
  }

  // Publish order.created event with sub-orders breakdown
  void publish(
    Topics.ORDER_CREATED,
    {
      topic:         Topics.ORDER_CREATED,
      orderId:       created.id,
      orderNumber:   created.orderNumber,
      userId:        created.userId,
      items:         allOrderItems,
      subOrders:     subOrders.map((so) => ({
        subOrderId:     so.id,
        subOrderNumber: so.subOrderNumber,
        sellerId:       so.sellerId,
        subtotal:       so.subtotal,
        vendorShare:    so.vendorShare,
        platformFee:    so.platformCommission,
        total:          so.totalAmount,
      })),
      total:         created.totalAmount,
      currency:      created.currency,
      createdAt:     created.createdAt,
    },
    created.userId,
  );

  void publishEvent(
    ROUTING_KEYS.ORDER_CREATED,
    {
      orderId:   created.id,
      userId:    created.userId,
      // `variantId` is carried so a consumer can address the row stock
      // actually lives on — inventory-service's order consumer documents its
      // absence as the reason it cannot move stock from an event.
      items:     allOrderItems.map((item) => ({
        productId:     item.productId,
        variantId:     item.variantId,
        quantity:      item.quantity,
        reservationId: item.variantId ? reservationByVariant.get(item.variantId) : undefined,
      })),
      subOrders: subOrders.map((so) => ({ subOrderId: so.id, sellerId: so.sellerId, subtotal: so.subtotal })),
      total:     created.totalAmount,
      currency:  created.currency,
      createdAt: created.createdAt,
    },
    { correlationId: created.id, service: 'order-service' },
  );

  return created;
}

// ─── Read Operations ─────────────────────────────────────────────────────────

export async function getById(id: string, repo: IOrderRepository = orderRepository): Promise<Order | undefined> {
  const order = await repo.findById(id);
  return order ?? undefined;
}

export async function getSubOrderById(id: string, repo: IOrderRepository = orderRepository): Promise<SubOrder | undefined> {
  const order = await repo.findOrderContainingSubOrder(id);
  return order?.subOrders.find((so) => so.id === id);
}

export async function listByUser(
  userId: string,
  page = 1,
  perPage = 15,
  repo: IOrderRepository = orderRepository,
): Promise<{ data: Order[]; meta: { current_page: number; last_page: number; per_page: number; total: number } }> {
  const { data, total } = await repo.listByUser(userId, page, perPage);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return { data, meta: { current_page: page, last_page: lastPage, per_page: perPage, total } };
}

export async function listSubOrdersBySeller(
  sellerId: string,
  status?: SubOrderStatus,
  page = 1,
  perPage = 15,
  repo: IOrderRepository = orderRepository,
): Promise<{ data: SubOrder[]; meta: { current_page: number; last_page: number; per_page: number; total: number } }> {
  const { data, total } = await repo.listSubOrdersBySeller(sellerId, status, page, perPage);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return { data, meta: { current_page: page, last_page: lastPage, per_page: perPage, total } };
}

/** Platform-wide order listing for the admin console. */
export async function listAllOrders(
  filters: AdminOrderFilters,
  page = 1,
  perPage = 20,
  repo: IOrderRepository = orderRepository,
): Promise<{ data: Order[]; meta: { current_page: number; last_page: number; per_page: number; total: number } }> {
  const { data, total } = await repo.listAll(filters, page, perPage);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return { data, meta: { current_page: page, last_page: lastPage, per_page: perPage, total } };
}

/** Order-side slice of the admin dashboard: GMV, commission, order counts. */
export async function getAdminStats(
  repo: IOrderRepository = orderRepository,
): Promise<AdminOrderStats> {
  return repo.adminStats();
}

/** Newest master orders platform-wide. Capped so a bad `limit` cannot scan the collection. */
export async function listRecentOrders(
  limit = 10,
  repo: IOrderRepository = orderRepository,
): Promise<{ data: Order[]; meta: { total: number; page: number; perPage: number } }> {
  const capped = Math.min(50, Math.max(1, limit));
  const data = await repo.listRecent(capped);
  return { data, meta: { total: data.length, page: 1, perPage: capped } };
}

// ─── Sub-Order Status Transition (Seller Dashboard / Fulfillment) ────────────

export async function updateSubOrderStatus(
  subOrderId: string,
  sellerId: string,
  newStatus: SubOrderStatus,
  meta?: { trackingNumber?: string; carrier?: string; estimatedDeliveryDate?: string },
  repo: IOrderRepository = orderRepository,
  // Explicit flag rather than a magic seller id. The check below used to read
  // `sellerId !== 'admin'`, comparing a user id against a literal string that no
  // real account ever has — so the admin bypass never fired, and the ownership
  // check was doing all the work by accident.
  isAdmin = false,
): Promise<SubOrder> {
  const masterOrder = await repo.findOrderContainingSubOrder(subOrderId);
  if (!masterOrder) throw Object.assign(new Error('Sub-order not found'), { status: 404 });

  const subOrder = masterOrder.subOrders.find((so) => so.id === subOrderId);
  if (!subOrder) throw Object.assign(new Error('Sub-order not found'), { status: 404 });
  if (!isAdmin && subOrder.sellerId !== sellerId) {
    throw Object.assign(new Error('Unauthorized to update this sub-order'), { status: 403 });
  }

  if (!isSubOrderStatus(newStatus)) {
    throw new InvalidStatusError(`"${newStatus}" is not an order status.`);
  }

  // Whether this call actually moved the parcel, as opposed to re-asserting
  // where it already was. Only a real transition books a delivery job — a
  // dashboard resending the current value should not put a second parcel into
  // the dispatch queue.
  const isTransition = subOrder.status !== newStatus;

  // Re-asserting the status a consignment already holds is a no-op, not an
  // error: a dashboard that resends the current value should not fail.
  if (subOrder.status !== newStatus) {
    const allowed = SUB_STATUS_TRANSITIONS[subOrder.status as SubOrderStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new InvalidStatusError(
        `An order that is "${SUB_STATUS_LABELS[subOrder.status as SubOrderStatus] ?? subOrder.status}" `
        + `cannot become "${SUB_STATUS_LABELS[newStatus]}".`,
      );
    }
  }

  const now = new Date().toISOString();
  subOrder.status = newStatus;
  subOrder.statusLabel = SUB_STATUS_LABELS[newStatus];
  subOrder.updatedAt = now;

  if (meta?.trackingNumber) subOrder.trackingNumber = meta.trackingNumber;
  if (meta?.carrier) subOrder.carrier = meta.carrier;
  if (meta?.estimatedDeliveryDate) subOrder.estimatedDeliveryDate = meta.estimatedDeliveryDate;

  if ((newStatus as string) === 'shipped' || newStatus === 'in_transit' || newStatus === 'picked_up') subOrder.shippedAt = now;
  if (newStatus === 'delivered') subOrder.deliveredAt = now;
  if (newStatus === 'cancelled') subOrder.cancelledAt = now;

  // Check master order status
  const allSubOrders = masterOrder.subOrders;
  const allDelivered = allSubOrders.every((so) => so.status === 'delivered');
  const allShipped = allSubOrders.every((so) => ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'].includes(so.status));

  if (allDelivered) {
    masterOrder.status = 'completed';
    masterOrder.statusLabel = MASTER_STATUS_LABELS.completed;
    masterOrder.deliveredAt = now;
  } else if (allShipped) {
    masterOrder.status = 'processing';
    masterOrder.statusLabel = MASTER_STATUS_LABELS.processing;
  }
  masterOrder.updatedAt = now;

  await repo.replace(masterOrder);

  // A seller accepting the sub-order is the point a parcel becomes real enough
  // to dispatch, so it is where the delivery job is booked. After the save, so
  // an unreachable fulfillment-service cannot stop a seller from accepting
  // their own order; idempotent on subOrderId, so the retry this invites is
  // free. See clients/fulfillment.client.ts for why this trigger and not an
  // earlier one.
  if (isTransition && newStatus === BOOK_JOB_AT_STATUS) {
    await bookDeliveryJob(masterOrder, subOrder).catch((err: unknown) => {
      logger.error('[order] delivery job booking threw — needs manual dispatch', { detail: {
        orderId: masterOrder.id, subOrderId: subOrder.id, error: (err as Error).message,
      } });
      return false;
    });
  }

  // Publish event for notifications & ledger settlement
  void publish(
    Topics.ORDER_EVENTS,
    {
      topic:          'order.sub_order_updated',
      subOrderId:     subOrder.id,
      masterOrderId:  subOrder.masterOrderId,
      sellerId:       subOrder.sellerId,
      status:         subOrder.status,
      vendorShare:    subOrder.vendorShare,
      trackingNumber: subOrder.trackingNumber,
      updatedAt:      now,
    },
    subOrder.sellerId,
  );

  if (newStatus === 'delivered') {
    void publish(
      Topics.ORDER_DELIVERED,
      {
        topic:       Topics.ORDER_DELIVERED,
        subOrderId:  subOrder.id,
        orderId:     subOrder.masterOrderId,
        sellerId:    subOrder.sellerId,
        vendorShare: subOrder.vendorShare,
        amount:      subOrder.totalAmount,
        deliveredAt: now,
      },
      subOrder.sellerId,
    );
  }

  return subOrder;
}

// ─── Master Order Status Update (Webhooks / Payment) ──────────────────────────

export async function updateMasterOrderStatus(
  masterOrderId: string,
  newStatus: MasterOrderStatus,
  paymentReference?: string,
  repo: IOrderRepository = orderRepository,
): Promise<Order> {
  const masterOrder = await repo.findById(masterOrderId);
  if (!masterOrder) throw Object.assign(new Error('Master order not found'), { status: 404 });

  const now = new Date().toISOString();
  masterOrder.status = newStatus;
  masterOrder.statusLabel = MASTER_STATUS_LABELS[newStatus];
  masterOrder.updatedAt = now;
  if (paymentReference) masterOrder.paymentReference = paymentReference;

  if (newStatus === 'paid' || newStatus === 'payment_confirmed') {
    masterOrder.paidAt = now;
    // Update all sub-orders to payment_confirmed
    for (const subOrder of masterOrder.subOrders) {
      subOrder.status = 'payment_confirmed';
      subOrder.statusLabel = SUB_STATUS_LABELS.payment_confirmed;
      subOrder.updatedAt = now;
    }
  }

  return repo.replace(masterOrder);
}

// ─── Cancel Order ─────────────────────────────────────────────────────────────

export async function cancel(
  id: string,
  userId: string,
  reason: string,
  repo: IOrderRepository = orderRepository,
  // An admin cancels an order they do not own, so the buyer-scoped lookup below
  // would always miss. `userId` is still recorded on the event for the audit
  // trail — it is just not used as an ownership filter.
  isAdmin = false,
): Promise<Order> {
  const order = isAdmin ? await repo.findById(id) : await repo.findByUserId(id, userId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  const cancellableStatuses: MasterOrderStatus[] = ['pending', 'payment_processing', 'paid', 'payment_confirmed'];
  if (!cancellableStatuses.includes(order.status)) {
    throw Object.assign(new Error(`Cannot cancel order with status '${order.status}'`), { status: 409 });
  }

  const now = new Date().toISOString();
  order.status = 'cancelled';
  order.statusLabel = MASTER_STATUS_LABELS.cancelled;
  order.cancellationReason = reason;
  order.cancelledAt = now;
  order.updatedAt = now;

  for (const subOrder of order.subOrders) {
    subOrder.status = 'cancelled';
    subOrder.statusLabel = SUB_STATUS_LABELS.cancelled;
    subOrder.cancelledAt = now;
    subOrder.updatedAt = now;
  }

  const saved = await repo.replace(order);

  // Put the goods back. Nothing else does: the RabbitMQ consumer in
  // inventory-service deliberately moves no stock, and order.cancelled carries
  // no line items for it to act on anyway — so before this, cancelling a paid
  // order left its units deducted for good.
  //
  // After the save, so a failure to reach inventory-service cannot leave the
  // customer's order stuck un-cancelled. Each line is attempted independently;
  // one unreachable variant must not strand the rest.
  for (const subOrder of saved.subOrders) {
    for (const item of subOrder.items) {
      if (!item.variantId) {
        logger.error('cancelled line names no variant — stock cannot be returned', { detail: {
          orderId: saved.id, productId: item.productId, quantity: item.quantity,
        } });
        continue;
      }
      // `restoreStock` swallows its own failures, but the cancellation must
      // not depend on it continuing to: the customer's order is already
      // cancelled and their refund already in train.
      await restoreStock(item.variantId, item.quantity, `order ${saved.id} cancelled`, userId)
        .catch((err: unknown) => {
          logger.error('stock NOT returned to the catalogue — needs manual correction', { detail: {
            orderId: saved.id, variantId: item.variantId, quantity: item.quantity,
            error: (err as Error).message,
          } });
        });
    }
  }

  void publish(
    Topics.ORDER_CANCELLED,
    {
      topic:       Topics.ORDER_CANCELLED,
      orderId:     saved.id,
      userId:      saved.userId,
      reason,
      cancelledAt: now,
    },
    saved.userId,
  );

  void publishEvent(
    ROUTING_KEYS.ORDER_CANCELLED,
    {
      orderId:     saved.id,
      userId:      saved.userId,
      reason,
      cancelledAt: now,
    },
    { correlationId: saved.id, service: 'order-service' },
  );

  return saved;
}
