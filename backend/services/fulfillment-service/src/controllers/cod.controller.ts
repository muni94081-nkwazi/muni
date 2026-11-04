import type { Request, Response } from 'express';
import { codService, CodError } from '../services/cod.service.js';
import { actorFrom } from './fulfillment.controller.js';

function handle(res: Response, err: unknown): void {
  const status = err instanceof CodError ? err.status : 500;
  res.status(status).json({ message: (err as Error).message });
}

/**
 * Roles cod.routes.ts already admits to any rider's ledger.
 *
 * Wider than `actorFrom`'s staff set by exactly one role: ROLE_FINANCE, which
 * reconciles cash and so has to read the ledger it is reconciling. Defined here
 * rather than added to the service-wide staff list, which would also hand
 * finance every seller's fulfillment.
 */
const LEDGER_STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN', 'ROLE_OPS', 'ROLE_FINANCE'];

function isLedgerStaff(res: Response): boolean {
  const roles = (res.locals.roles as string[]) ?? [];
  return Boolean(res.locals.callingService) || roles.some((r) => LEDGER_STAFF_ROLES.includes(r));
}

export async function flagCod(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { amountDue, currency } = req.body;
    // The actor decides whether this parcel is theirs to flag. The route only
    // ever checked that SOMEBODY was logged in, so any customer could set any
    // seller's parcel to COD for any amount.
    const f = await codService.flagAsCod(
      req.params.id,
      Number(amountDue),
      currency ?? 'UGX',
      actorFrom(res),
    );
    res.json({ data: f });
  } catch (err) {
    handle(res, err);
  }
}

export async function collectCash(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { amountCollected, notes } = req.body;
    if (amountCollected === undefined) {
      res.status(400).json({ message: 'amountCollected is required' });
      return;
    }
    const collection = await codService.collectCash(req.params.id, res.locals.userId, Number(amountCollected), notes);
    res.status(201).json({ data: collection });
  } catch (err) {
    handle(res, err);
  }
}

/**
 * A rider's cash position for one day.
 *
 * The route admits ops, finance, admin — and riders, because a rider needs to
 * see what they owe at the end of a shift. `:riderId` was taken as proof of
 * which rider was asking, so any rider could read another's takings, variance
 * and reconciliation status by editing the URL.
 *
 * Riders are identifiable people on a roster rather than rows to enumerate, and
 * the caller typed the id themselves, so this is a plain 403 rather than the
 * 404 used where an id could be probed.
 */
export async function getLedger(req: Request<{ riderId: string; date: string }>, res: Response): Promise<void> {
  try {
    const { riderId, date } = req.params;

    if (!isLedgerStaff(res) && riderId !== (res.locals.userId as string)) {
      res.status(403).json({ message: 'You can only view your own cash ledger.' });
      return;
    }

    res.json({ data: await codService.getRiderLedger(riderId, date) });
  } catch (err) {
    handle(res, err);
  }
}

export async function reconcileLedger(req: Request<{ riderId: string; date: string }>, res: Response): Promise<void> {
  try {
    const { riderId, date } = req.params;
    const { remittedAmount } = req.body;
    if (remittedAmount === undefined) {
      res.status(400).json({ message: 'remittedAmount is required' });
      return;
    }
    const entry = await codService.reconcileLedger(riderId, date, Number(remittedAmount), res.locals.userId);
    res.json({ data: entry });
  } catch (err) {
    handle(res, err);
  }
}

export async function listPendingReconciliations(_req: Request, res: Response): Promise<void> {
  try {
    res.json({ data: await codService.listPendingReconciliations() });
  } catch (err) {
    handle(res, err);
  }
}
