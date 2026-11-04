import { Request, Response, NextFunction } from 'express';
import * as service from '../services/return.service.js';
import { ReturnRequestSchema } from '../models/return.model.js';

/**
 * The authenticated caller, and the only accepted source of identity.
 *
 * These handlers resolved the customer as
 *   req.headers['x-user-id'] || res.locals.userId || 'user-123'
 * which trusted the raw header ahead of the value requireAuth publishes, and
 * fell back to a shared fake account for any request with no identity at all —
 * verified: an unauthenticated POST created a return owned by 'user-123'.
 *
 * requireAuth now runs on every customer route (see routes/index.ts) and puts
 * the gateway-stamped identity in res.locals.userId, so that is what is read.
 */
function actingUser(res: Response): string {
  const userId = res.locals.userId as string | undefined;
  if (!userId) throw new Error('actingUser called on a route that is not behind requireAuth');
  return userId;
}

export const createReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = actingUser(res);
    // The schema carries no refundAmount and no userId, and Zod drops unknown
    // keys — so neither can be supplied by the browser.
    const data = ReturnRequestSchema.parse(req.body);
    const result = await service.createReturn({ ...data, userId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    // This is express 4 with no async-error middleware, so a throw inside an
    // async handler never reaches app.ts's error handler on its own — a
    // malformed payload became an unhandled rejection rather than the 422 that
    // handler is written to produce. Forwarding explicitly reuses it.
    next(err);
  }
};

export const getUserReturns = async (_req: Request, res: Response) => {
  res.json({ success: true, data: await service.getUserReturns(actingUser(res)) });
};

export const getReturn = async (req: Request, res: Response) => {
  const found = await service.getOwnReturn(req.params.id, actingUser(res));
  if (!found) {
    res.status(404).json({ success: false, message: 'Return not found' });
    return;
  }
  res.json({ success: true, data: found });
};

export const cancelReturn = async (req: Request, res: Response) => {
  const result = await service.cancelOwnReturn(req.params.id, actingUser(res));

  if (!result.ok) {
    if (result.reason === 'invalid_state') {
      res.status(409).json({
        success: false,
        message: 'Only a return that is still awaiting review can be cancelled.',
      });
      return;
    }
    res.status(404).json({ success: false, message: 'Return not found' });
    return;
  }

  res.json({ success: true, data: result.data });
};

export const checkGuaranteeStatus = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { orderDeliveredAt } = req.query;
  const status = await service.checkGuaranteeEligibility(orderId, orderDeliveredAt as string);
  res.json({ success: true, data: status });
};

export const getSellerReturns = async (req: Request, res: Response) => {
  const sellerId = (req.headers['x-user-id'] as string) || res.locals.userId || 'seller-001';
  res.json({ success: true, data: await service.getSellerReturns(sellerId) });
};

export const updateSellerReturn = async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateStatus(req.params.id, req.body.status) });
};

export const getAdminReturns = async (_req: Request, res: Response) => {
  res.json({ success: true, data: await service.getAllReturns() });
};

export const updateAdminReturn = async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.updateStatus(req.params.id, req.body.status) });
};
