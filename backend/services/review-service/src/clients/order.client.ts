import env from '../config/env.js';
import logger from '../config/logger.js';

// ─── order-service client ───────────────────────────────────────────────────
//
// Used only on the projection-miss path (see purchase.service.ts). Every call
// is bounded: an unbounded fetch here would hold a review submission open for
// as long as order-service takes to fail.

export class OrderServiceUnavailableError extends Error {
  readonly status = 503;
  constructor(cause: string) {
    super(`order-service is unreachable: ${cause}`);
    this.name = 'OrderServiceUnavailableError';
  }
}

interface RemoteOrderItem {
  productId: string;
  variantId?: string;
  sellerId?: string;
  quantity?: number;
}

interface RemoteSubOrder {
  id: string;
  sellerId: string;
  status: string;
  items?: RemoteOrderItem[];
  deliveredAt?: string | null;
}

interface RemoteOrder {
  id: string;
  userId: string;
  status: string;
  items?: RemoteOrderItem[];
  subOrders?: RemoteSubOrder[];
  placedAt?: string | null;
  deliveredAt?: string | null;
  createdAt?: string;
}

interface RemoteOrderPage {
  data?: RemoteOrder[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface RemotePurchase {
  orderId: string;
  subOrderId?: string | null;
  sellerId?: string | null;
  variantId?: string | null;
  quantity?: number;
  delivered: boolean;
  orderedAt?: string | null;
  deliveredAt?: string | null;
}

/** Sub-order statuses that mean the buyer physically has the goods. */
const DELIVERED_SUB_STATUSES = new Set(['delivered']);
/** Master-order statuses that mean the whole order arrived. */
const DELIVERED_ORDER_STATUSES = new Set(['completed']);

const MAX_PAGES = 10;
const PER_PAGE = 50;

async function getJson<T>(path: string, userId: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.serviceTimeoutMs);

  try {
    const response = await fetch(new URL(path, env.orderServiceUrl), {
      method: 'GET',
      // order-service authorises on the gateway-stamped identity header, the
      // same contract the gateway itself uses when proxying.
      headers: { 'content-type': 'application/json', 'x-user-id': userId },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OrderServiceUnavailableError(`responded ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof OrderServiceUnavailableError) throw err;
    const reason =
      (err as Error).name === 'AbortError'
        ? `timed out after ${env.serviceTimeoutMs}ms`
        : (err as Error).message;
    throw new OrderServiceUnavailableError(reason);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every purchase of `productId` this buyer has made, flattened out of their
 * order history with a per-sub-order delivery verdict.
 *
 * Delivery is judged at the sub-order level when sub-orders exist, because a
 * multi-seller order is delivered piecemeal — the master status only reaches
 * "completed" once every seller has delivered, which would make the first
 * seller's item unreviewable until the slowest one arrived.
 */
export async function fetchDeliveredPurchases(
  userId: string,
  productId: string,
): Promise<RemotePurchase[]> {
  const purchases: RemotePurchase[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await getJson<RemoteOrderPage>(
      `/api/v1/orders?page=${page}&per_page=${PER_PAGE}`,
      userId,
    );
    const orders = body.data ?? [];

    for (const order of orders) {
      const subOrders = order.subOrders ?? [];

      if (subOrders.length > 0) {
        for (const subOrder of subOrders) {
          const line = (subOrder.items ?? []).find((item) => item.productId === productId);
          if (!line) continue;
          purchases.push({
            orderId: order.id,
            subOrderId: subOrder.id,
            sellerId: subOrder.sellerId ?? line.sellerId ?? null,
            variantId: line.variantId ?? null,
            quantity: line.quantity ?? 1,
            delivered: DELIVERED_SUB_STATUSES.has(subOrder.status),
            orderedAt: order.placedAt ?? order.createdAt ?? null,
            deliveredAt: subOrder.deliveredAt ?? null,
          });
        }
        continue;
      }

      // Older orders carry a flat item list with no sub-order breakdown.
      const line = (order.items ?? []).find((item) => item.productId === productId);
      if (!line) continue;
      purchases.push({
        orderId: order.id,
        subOrderId: null,
        sellerId: line.sellerId ?? null,
        variantId: line.variantId ?? null,
        quantity: line.quantity ?? 1,
        delivered: DELIVERED_ORDER_STATUSES.has(order.status),
        orderedAt: order.placedAt ?? order.createdAt ?? null,
        deliveredAt: order.deliveredAt ?? null,
      });
    }

    const lastPage = body.meta?.last_page ?? 1;
    if (page >= lastPage) break;
    if (page === MAX_PAGES) {
      logger.warn('order history longer than the backfill page cap; older purchases not scanned', {
        userId,
        productId,
        scannedPages: MAX_PAGES,
      });
    }
  }

  return purchases;
}
