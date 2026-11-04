import { logger } from '../utils/logger.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as orderService from '../services/order.service.js';
import type { SubOrderStatus, MasterOrderStatus } from '../models/order.model.js';

// ─── Request validation ───────────────────────────────────────────────────────
//
// `.strip()` is the default and it is doing real work here: unitPrice,
// lineTotal, sellerId and totalAmount are simply absent from the parsed
// result, so a handler cannot read one even by mistake. order.service
// re-derives all of them from the catalogue.

const OrderLineSchema = z.object({
  productId: z.string().trim().min(1).optional(),
  variantId: z.string().trim().min(1, 'Each line must name a product variant'),
  quantity:  z.number().int().min(1).max(1000),
  // Present only when checkout-service's saga already holds the stock.
  reservationId: z.string().trim().min(1).optional(),
});

const ShippingSchema = z.object({
  address:      z.string().trim().min(1, 'Delivery address is required'),
  city:         z.string().trim().min(1, 'City is required'),
  phone:        z.string().trim().min(1, 'Phone number is required'),
  district:     z.string().trim().optional(),
  notes:        z.string().trim().max(1000).optional(),
  shipping_fee: z.number().nonnegative().optional(),
});

const CreateOrderSchema = z.object({
  items:    z.array(OrderLineSchema).min(1, 'An order needs at least one item').max(200),
  shipping: ShippingSchema,
  paymentMethod:  z.string().trim().max(50).optional(),
  couponCode:     z.string().trim().max(64).optional(),
  // Clamped again in the service against the computed subtotal; rejected here
  // only when it is not a sane number at all.
  discountAmount: z.number().nonnegative().optional(),
  // The authoritative per-seller split of that discount, from checkout. Keyed
  // by sellerId like its sibling vendorShippingFees.
  vendorDiscounts: z.record(z.number().nonnegative()).optional(),
  // sellerId -> tax, so the recorded order total matches what was charged.
  vendorTaxes: z.record(z.number().nonnegative()).optional(),
  vendorShippingFees: z.record(z.number().nonnegative()).optional(),
  sessionId:      z.string().trim().max(128).optional(),
});

function badRequest(res: Response, error: z.ZodError): void {
  res.status(400).json({
    message: 'Invalid request',
    errors:  error.flatten().fieldErrors,
  });
}

// ─── Identity helpers ─────────────────────────────────────────────────────────
//
// Identity is resolved by `requireAuth` (shared/http/service-auth.middleware)
// and read from `res.locals` — never from the raw headers.
//
// That distinction matters. Reading `x-user-roles` directly is only safe while
// the gateway strips inbound copies AND nothing can reach this service except
// through the gateway. When the signing secret is configured, res.locals is
// populated from a cryptographically verified assertion instead, so a request
// arriving on the pod's port with a hand-written `x-user-roles: ROLE_ADMIN`
// header grants nothing.
//
// Roles arrive as a comma-separated list under `x-user-roles` — the plural. Two
// checks in this file read a singular `x-user-role`, and one compared the user
// id against the literal string 'admin'; neither header nor id is ever produced
// by the gateway, so both admin bypasses silently never fired.

function rolesOf(res: Response): string[] {
  return (res.locals.roles as string[]) ?? [];
}

function isAdmin(res: Response): boolean {
  const roles = rolesOf(res);
  return roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER_ADMIN');
}

export async function create(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }

  // Note what the parsed body cannot contain: subtotal, totalAmount, and any
  // per-line unitPrice/lineTotal. The schema strips them, and order.service
  // re-reads every one from product-service.
  try {
    const order = await orderService.create({
      userId,
      ...parsed.data,
    });

    res.status(201).json({ data: order });
  } catch (err) {
    // Errors carry a status from the layer that knows what went wrong: 409 for
    // a sold-out or delisted line, 422 for a malformed one, 503 when the
    // catalogue is unreachable. Flattening them to 500 would tell the customer
    // "something went wrong" when the real answer is "reduce the quantity".
    const error = err as Error & { status?: number };
    const status = error.status ?? 500;

    if (status >= 500) {
      logger.error('order creation failed', { detail: error.message });
    }

    res.status(status).json({
      message: status >= 500 ? 'Could not place your order. Please try again.' : error.message,
      code:    error.name,
    });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const order = await orderService.getById(req.params.id);
  if (!order) {
    res.status(404).json({ message: 'Order not found' });
    return;
  }
  if (userId && order.userId !== userId && !isAdmin(res)) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }
  res.json({ data: order });
}

export async function list(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const perPage = Math.min(50, Math.max(1, parseInt((req.query.per_page as string) ?? '15', 10)));

  const result = await orderService.listByUser(userId, page, perPage);
  res.json(result);
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const reason = (req.body?.reason as string) ?? 'Cancelled by buyer';
  const order = await orderService.cancel(req.params.id, userId, reason);
  res.json({ data: order });
}

export async function getInvoice(req: Request, res: Response): Promise<void> {
  const order = await orderService.getById(req.params.id);
  if (!order) {
    res.status(404).json({ message: 'Order not found' });
    return;
  }

  res.json({
    data: {
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber:   order.orderNumber,
      issuedAt:      order.createdAt,
      billingAddress: order.shipping,
      subtotal:      order.subtotal,
      shippingFee:   order.shippingFee,
      taxAmount:     order.taxAmount,
      totalAmount:   order.totalAmount,
      currency:      order.currency,
      subOrders:     order.subOrders,
    },
  });
}

// ─── Seller Sub-Order Management ──────────────────────────────────────────────

export async function listSellerSubOrders(req: Request, res: Response): Promise<void> {
  const sellerId = res.locals.userId as string;
  if (!sellerId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const status = req.query.status as SubOrderStatus | undefined;
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const perPage = Math.min(50, Math.max(1, parseInt((req.query.per_page as string) ?? '15', 10)));

  const result = await orderService.listSubOrdersBySeller(sellerId, status, page, perPage);
  res.json(result);
}

export async function getSellerSubOrder(req: Request, res: Response): Promise<void> {
  const sellerId = res.locals.userId as string;
  const subOrder = await orderService.getSubOrderById(req.params.id);
  if (!subOrder) {
    res.status(404).json({ message: 'Sub-order not found' });
    return;
  }

  if (!isAdmin(res) && subOrder.sellerId !== sellerId) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }

  res.json({ data: subOrder });
}

export async function updateSubOrderStatus(req: Request, res: Response): Promise<void> {
  const sellerId = res.locals.userId as string;
  if (!sellerId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const { status, trackingNumber, carrier, estimatedDeliveryDate } = req.body as {
    status: SubOrderStatus;
    trackingNumber?: string;
    carrier?: string;
    estimatedDeliveryDate?: string;
  };

  if (!status) {
    res.status(400).json({ message: 'Status is required' });
    return;
  }

  const subOrder = await orderService.updateSubOrderStatus(
    req.params.id,
    sellerId,
    status,
    { trackingNumber, carrier, estimatedDeliveryDate },
    undefined,          // use the default repository
    isAdmin(res),
  );

  res.json({ data: subOrder });
}

// ─── Admin Order Console ──────────────────────────────────────────────────────
//
// Reached only through /api/v1/admin/*, which the gateway gates with
// requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'). Unlike the seller handlers
// above, nothing here is scoped by x-user-id — an admin sees every order and
// every sub-order in it.

/** GET /api/v1/admin/orders */
export async function adminListOrders(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt((req.query.per_page as string) ?? '20', 10)));

  const result = await orderService.listAllOrders(
    {
      status:   (req.query.status as MasterOrderStatus | undefined) || undefined,
      sellerId: (req.query.seller_id as string | undefined) || undefined,
      q:        (req.query.q as string | undefined) || undefined,
    },
    page,
    perPage,
  );

  res.json(result);
}

/**
 * GET /api/v1/admin/stats — order-side slice of the admin dashboard.
 *
 * Called server-to-server by the gateway's /api/v1/admin/dashboard/stats
 * aggregator rather than by the browser, which is why it is not mounted under
 * a gateway proxy prefix of its own.
 */
export async function adminStats(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await orderService.getAdminStats() });
}

/** GET /api/v1/admin/dashboard/recent-orders — newest master orders, default 10. */
export async function adminRecentOrders(req: Request, res: Response): Promise<void> {
  const limit = parseInt((req.query.limit as string) ?? '10', 10);
  res.json(await orderService.listRecentOrders(Number.isNaN(limit) ? 10 : limit));
}

/** GET /api/v1/admin/orders/:id — any order, including its per-seller breakdown. */
export async function adminGetOrder(req: Request, res: Response): Promise<void> {
  const order = await orderService.getById(req.params.id);
  if (!order) {
    res.status(404).json({ message: 'Order not found' });
    return;
  }
  res.json({ data: order });
}

/**
 * POST /api/v1/admin/orders/:id/cancel — admin force-cancel.
 *
 * Separate from cancelOrder() above because the buyer path scopes the lookup by
 * x-user-id; an admin does not own the order. The same status guard applies —
 * an order already in transit cannot be cancelled here either, and refunding a
 * shipped order is a payment-service concern rather than an order-state change.
 */
export async function adminCancelOrder(req: Request, res: Response): Promise<void> {
  const adminId = res.locals.userId as string;
  if (!adminId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const reason = (req.body?.reason as string)?.trim();
  if (!reason) {
    res.status(400).json({ message: 'A cancellation reason is required' });
    return;
  }

  const order = await orderService.cancel(req.params.id, adminId, reason, undefined, true);
  res.json({ data: order });
}
