import type { NextFunction, Request, Response } from 'express';
import { checkoutService, type Actor } from '../services/checkout.service.js';

// ─── Checkout Controller ──────────────────────────────────────────────────────
//
// Thin by design: the controller resolves the actor and hands off. Ownership,
// state validation and pricing all live in the service, so no route can be
// added that accidentally skips them.
//
// Errors carry a `status` set by the layer that knows what went wrong, and are
// forwarded to the app-level handler rather than flattened to 400 here — a
// sold-out item (409) and an unreachable payment gateway (502) are not the
// same problem and the client cannot act on them the same way.

function actorFrom(res: Response): Actor {
  return {
    id:    res.locals.userId as string,
    roles: (res.locals.roles as string[]) ?? [],
  };
}

export async function initiateCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await checkoutService.initiateCheckout(actorFrom(res), req.body ?? {});
    res.status(201).json({ success: true, data: session });
  } catch (e) { next(e); }
}

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await checkoutService.getSession(req.params.sessionId, actorFrom(res));
    res.json({ success: true, data: session });
  } catch (e) { next(e); }
}

export async function confirmPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await checkoutService.confirmPayment(req.params.sessionId, actorFrom(res));
    res.json({ success: true, data: session });
  } catch (e) { next(e); }
}

export async function cancelCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await checkoutService.cancelCheckout(req.params.sessionId, actorFrom(res));
    res.json({ success: true, data: session });
  } catch (e) { next(e); }
}

export async function getHistory(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessions = await checkoutService.getHistory(actorFrom(res));
    res.json({ success: true, data: sessions });
  } catch (e) { next(e); }
}
