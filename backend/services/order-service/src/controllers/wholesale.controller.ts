import { logger } from '../utils/logger.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { wholesaleService } from '../services/wholesale.service.js';

// ─── Wholesale Controller ─────────────────────────────────────────────────────
//
// These routes existed as a service class with nothing mounted in front of it,
// so /api/v1/wholesale 404'd through the gateway. Wiring them up is also the
// point at which the price has to stop being negotiable: the service now reads
// the base price from product-service, and nothing here forwards one.

const TiersQuerySchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

const CreateOrderSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity:  z.number().int().min(1, 'quantity must be at least 1').max(100_000),
});

function fail(res: Response, err: unknown): void {
  const error  = err as Error & { status?: number };
  const status = error.status ?? 500;

  if (status >= 500) {
    logger.error('wholesale request failed', { detail: error.message });
  }

  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Could not complete that request. Please try again.' : error.message,
    code:    error.name,
  });
}

/** GET /api/v1/wholesale/tiers?productId=… */
export async function getTiers(req: Request, res: Response): Promise<void> {
  const parsed = TiersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid request',
      errors:  parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const tiers = await wholesaleService.getWholesaleTiers(
      parsed.data.productId,
      res.locals.userId as string | undefined,
    );
    res.json({ success: true, data: tiers });
  } catch (err) {
    fail(res, err);
  }
}

/** POST /api/v1/wholesale/orders */
export async function createOrder(req: Request, res: Response): Promise<void> {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid request',
      errors:  parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    // The buyer is the verified caller, never a body field — otherwise one
    // account could place bulk orders in another's name.
    const order = await wholesaleService.createWholesaleOrder(
      res.locals.userId as string,
      parsed.data.productId,
      parsed.data.quantity,
    );
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    fail(res, err);
  }
}

/** GET /api/v1/wholesale/orders */
export async function listOrders(_req: Request, res: Response): Promise<void> {
  try {
    const orders = await wholesaleService.listWholesaleOrders(res.locals.userId as string);
    res.json({ success: true, data: orders });
  } catch (err) {
    fail(res, err);
  }
}
