import { logger } from '../utils/logger.js';
import {
  signServiceIdentity,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';

const SERVICE_NAME = 'order-service';

// ─── Catalogue & Inventory Client ─────────────────────────────────────────────
//
// order-service must never learn a price from whoever called it. Both the
// browser (`POST /orders`) and checkout-service's saga send line items, and
// only one of those is trustworthy — so neither is trusted. Prices are read
// here, from product-service, on every order.
//
// Reservations work the same way: an order that was not preceded by a hold on
// stock is an oversell waiting to happen, so if the caller did not already
// reserve (the saga does), we reserve here before the order is written.
//
// Every call is bounded. An unbounded fetch during order creation holds the
// request — and any reservation already taken — open until something else
// gives up first.

const DEFAULT_TIMEOUT_MS = Number(process.env.SERVICE_TIMEOUT_MS ?? 5_000);

const PRODUCT_SERVICE_URL   = process.env.PRODUCT_SERVICE_URL   ?? 'http://localhost:4002';
// 4004, not 4011. inventory-service binds `process.env.PORT ?? 4004`, and the
// gateway and docker-compose both point at 4004. 4011 is REVIEW-service's port
// (review-service/src/config/env.ts), so a developer running both services
// directly would not get a connection error here — they would get review-
// service answering a stock reservation, which is a stranger failure to debug.
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:4004';
const PAYMENT_SERVICE_URL   = process.env.PAYMENT_SERVICE_URL   ?? 'http://localhost:4005';

/** Raised when a downstream service cannot be reached at all. */
export class CatalogUnavailableError extends Error {
  readonly status = 503;
  constructor(service: string, cause: string) {
    super(`${service} is unreachable: ${cause}`);
    this.name = 'CatalogUnavailableError';
  }
}

/** Raised when a line references something that is not purchasable. */
export class ItemUnavailableError extends Error {
  readonly status = 409;
  constructor(readonly reference: string) {
    super(`"${reference}" is no longer available and was removed from your order.`);
    this.name = 'ItemUnavailableError';
  }
}

/** Raised when stock cannot cover a line. Carries what is left, when known. */
export class OutOfStockError extends Error {
  readonly status = 409;
  constructor(readonly reference: string, readonly available?: number) {
    super(
      available !== undefined && available > 0
        ? `Only ${available} of "${reference}" left — please reduce the quantity.`
        : `"${reference}" just sold out.`,
    );
    this.name = 'OutOfStockError';
  }
}

interface FetchOptions {
  method?:  'GET' | 'POST';
  body?:    unknown;
  actorId?: string;
  service:  string;
}

interface RawResponse<T> {
  ok:     boolean;
  status: number;
  data:   T;
}

async function request<T>(url: string, opts: FetchOptions): Promise<RawResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.actorId) headers['x-user-id'] = opts.actorId;

  // inventory-service's reserve/release/deduct routes are internal-only and
  // require the `svc` claim. Without this the direct-order path would be
  // refused by the very reservation it depends on.
  if (opts.actorId) {
    const assertion = signServiceIdentity(opts.actorId, [], SERVICE_NAME);
    if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;
  }

  try {
    const response = await fetch(url, {
      method:  opts.method ?? 'GET',
      headers,
      body:    opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal:  controller.signal,
    });

    // A non-JSON body (HTML error page, empty 204) must not throw here — the
    // caller decides what a given status means.
    let data: T;
    const text = await response.text();
    try { data = text ? (JSON.parse(text) as T) : ({} as T); }
    catch { data = {} as T; }

    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    const reason = (err as Error).name === 'AbortError'
      ? `timed out after ${DEFAULT_TIMEOUT_MS}ms`
      : (err as Error).message;

    logger.error('catalog call failed', { detail: { url, service: opts.service, reason } });
    throw new CatalogUnavailableError(opts.service, reason);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

export interface CatalogVariant {
  id:          string;
  productId:   string;
  sku:         string;
  price:       number;
  productName: string;
  sellerId:    string;
  currency:    string;
  weightKg?:   number | null;
  images?:     string[];
}

interface VariantEnvelope {
  data?: {
    id:            string;
    productId:     string;
    sku:           string;
    price:         number | string;
    productName:   string;
    sellerId:      string;
    currency?:     string;
    weightKg?:     number | null;
    images?:       string[];
  };
}

/**
 * Authoritative price for one variant.
 *
 * Throws ItemUnavailableError on 404 — product-service only returns variants
 * that are active on a product that is itself ACTIVE, so a miss means the line
 * is genuinely not sellable, not that the id was malformed.
 */
export async function fetchVariant(variantId: string, actorId?: string): Promise<CatalogVariant> {
  const res = await request<VariantEnvelope>(
    `${PRODUCT_SERVICE_URL}/api/v1/products/variants/${encodeURIComponent(variantId)}`,
    { service: 'product-service', actorId },
  );

  if (res.status === 404 || !res.data.data) throw new ItemUnavailableError(variantId);
  if (!res.ok) throw new CatalogUnavailableError('product-service', `status ${res.status}`);

  const variant = res.data.data;

  // Prisma serialises Decimal as a string; Number() handles both shapes.
  const price = Number(variant.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new CatalogUnavailableError('product-service', `variant ${variantId} has no usable price`);
  }

  return {
    id:          variant.id,
    productId:   variant.productId,
    sku:         variant.sku,
    price,
    productName: variant.productName,
    sellerId:    variant.sellerId,
    currency:    variant.currency ?? 'UGX',
    weightKg:    variant.weightKg ?? null,
    images:      variant.images ?? [],
  };
}

export interface CatalogProduct {
  id:        string;
  name:      string;
  basePrice: number;
  sellerId:  string;
  currency:  string;
}

interface ProductEnvelope {
  data?: {
    id:         string;
    name:       string;
    basePrice:  number | string;
    sellerId:   string;
    currency?:  string;
  };
}

/**
 * Authoritative catalogue price for a product.
 *
 * Wholesale tiers are percentages off this figure. Taking it from the request
 * meant the caller chose the number every tier was derived from — a request
 * naming a basePrice of 1 bought in bulk for pennies.
 */
export async function fetchProduct(productId: string, actorId?: string): Promise<CatalogProduct> {
  const res = await request<ProductEnvelope>(
    `${PRODUCT_SERVICE_URL}/api/v1/products/${encodeURIComponent(productId)}`,
    { service: 'product-service', actorId },
  );

  if (res.status === 404 || !res.data.data) throw new ItemUnavailableError(productId);
  if (!res.ok) throw new CatalogUnavailableError('product-service', `status ${res.status}`);

  const product = res.data.data;
  const basePrice = Number(product.basePrice);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new CatalogUnavailableError('product-service', `product ${productId} has no usable price`);
  }

  return {
    id:        product.id,
    name:      product.name,
    basePrice,
    sellerId:  product.sellerId,
    currency:  product.currency ?? 'UGX',
  };
}

// ─── Inventory ────────────────────────────────────────────────────────────────

interface ReserveEnvelope {
  data?:    { reservationId?: string };
  message?: string;
}

/**
 * Take a TTL-bounded hold on stock, using inventory-service's
 * `SELECT … FOR UPDATE` reservation path.
 *
 * A 409 is a normal retail outcome (someone else got the last one), so it is
 * surfaced as OutOfStockError rather than a system failure.
 */
export async function reserveStock(
  variantId: string,
  quantity: number,
  sessionId: string,
  reference: string,
  actorId?: string,
): Promise<string> {
  const res = await request<ReserveEnvelope>(
    `${INVENTORY_SERVICE_URL}/api/v1/inventory/${encodeURIComponent(variantId)}/reserve`,
    { service: 'inventory-service', method: 'POST', actorId, body: { quantity, sessionId, userId: actorId } },
  );

  if (res.status === 409) {
    const available = Number(/only (\d+)/i.exec(res.data.message ?? '')?.[1]);
    throw new OutOfStockError(reference, Number.isFinite(available) ? available : undefined);
  }
  if (res.status === 404) throw new ItemUnavailableError(reference);
  if (!res.ok || !res.data.data?.reservationId) {
    throw new CatalogUnavailableError('inventory-service', res.data.message ?? `status ${res.status}`);
  }

  return res.data.data.reservationId;
}

/**
 * Settle a hold into a real stock movement.
 *
 * The counterpart to `reserveStock`, and the step the direct order path never
 * had: an order created through `POST /orders` reserved stock and then never
 * deducted it, so the hold lapsed on its TTL and the stock quietly returned to
 * the shelf after the customer had paid.
 *
 * Throws on failure so the caller can compensate — an expired reservation
 * means the goods may now be sold to someone else, which is not something to
 * swallow after money has changed hands.
 */
export async function deductStock(
  variantId: string,
  quantity: number,
  reservationId: string | undefined,
  actorId?: string,
): Promise<void> {
  const res = await request<{ message?: string }>(
    `${INVENTORY_SERVICE_URL}/api/v1/inventory/${encodeURIComponent(variantId)}/deduct`,
    {
      service: 'inventory-service',
      method:  'POST',
      actorId,
      body:    { quantity, ...(reservationId ? { reservationId } : {}) },
    },
  );

  if (!res.ok) {
    throw new StockSettlementError(
      variantId,
      res.data.message ?? `inventory-service returned ${res.status}`,
    );
  }
}

/** Raised when a paid order's stock cannot be settled. */
export class StockSettlementError extends Error {
  readonly status = 409;
  constructor(readonly variantId: string, detail: string) {
    super(`Could not settle stock for variant ${variantId}: ${detail}`);
    this.name = 'StockSettlementError';
  }
}

/**
 * Hand the customer's money back.
 *
 * Called only on the compensation path, when an order was paid for but cannot
 * be fulfilled. Throws rather than swallowing: a refund that silently failed
 * leaves a customer charged for goods they will never receive, which must
 * surface loudly rather than be logged and forgotten.
 */
export async function refundPayment(
  paymentReference: string,
  reason: string,
  actorId?: string,
): Promise<void> {
  const res = await request<{ message?: string }>(
    `${PAYMENT_SERVICE_URL}/api/v1/payments/${encodeURIComponent(paymentReference)}/refund`,
    { service: 'payment-service', method: 'POST', actorId, body: { reason } },
  );

  if (!res.ok) {
    throw new CatalogUnavailableError(
      'payment-service',
      `refund of ${paymentReference} returned ${res.status}: ${res.data.message ?? 'no detail'}`,
    );
  }
}

/**
 * Best-effort release of a hold taken earlier in the same request.
 *
 * Never throws: this runs on the failure path, and masking the original cause
 * with a compensation error would hide why the order was rejected. A hold that
 * fails to release expires on its own via the reservation TTL.
 */
export async function releaseStock(variantId: string, reservationId: string, actorId?: string): Promise<void> {
  try {
    await request(
      `${INVENTORY_SERVICE_URL}/api/v1/inventory/${encodeURIComponent(variantId)}/release`,
      { service: 'inventory-service', method: 'POST', actorId, body: { reservationId } },
    );
  } catch (err) {
    logger.error('reservation release failed — will expire via TTL', { detail: {
      variantId,
      reservationId,
      error: (err as Error).message,
    } });
  }
}

/**
 * Put deducted units back on the shelf.
 *
 * The counterpart to `deductStock`, for goods that were paid for and then
 * un-bought. Cancellation had no such step at all: the order flipped to
 * 'cancelled' and the stock it had consumed simply stayed consumed.
 *
 * Never throws. A cancellation must not fail because inventory-service is
 * briefly unreachable — the customer's order is already cancelled and their
 * refund already in train. A failure here is logged loudly because it needs a
 * human: unlike a lapsed hold, nothing expires these units back into stock.
 */
export async function restoreStock(
  variantId: string,
  quantity: number,
  reason: string,
  actorId?: string,
): Promise<boolean> {
  try {
    const res = await request<{ message?: string }>(
      `${INVENTORY_SERVICE_URL}/api/v1/inventory/${encodeURIComponent(variantId)}/restore`,
      { service: 'inventory-service', method: 'POST', actorId, body: { quantity, reason } },
    );
    if (!res.ok) throw new Error(res.data.message ?? `status ${res.status}`);
    return true;
  } catch (err) {
    logger.error('stock NOT returned to the catalogue — needs manual correction', { detail: {
      variantId, quantity, reason, error: (err as Error).message,
    } });
    return false;
  }
}
