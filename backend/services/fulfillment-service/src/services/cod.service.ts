import { randomUUID } from 'node:crypto';
import { fulfillmentService, FulfillmentService, type FulfillmentActor } from './fulfillment.service.js';
import { CashLedgerEntry, CodCollection, CodVerificationStatus } from '../models/cod.model.js';
import { prismaCodRepository } from '../repositories/prisma-fulfillment.repository.js';
import type { ICodRepository } from '../types/repositories.js';

export class CodError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Rounding/mobile-money-fee slack tolerated before a collection is flagged SHORT/DISPUTED.
const VARIANCE_TOLERANCE = 100; // UGX
const EAT_OFFSET_MINUTES = 3 * 60; // Uganda is fixed UTC+3, no DST

function eatDateString(): string {
  const eat = new Date(Date.now() + EAT_OFFSET_MINUTES * 60 * 1000);
  return eat.toISOString().slice(0, 10);
}

export function ledgerKey(riderId: string, date: string): string {
  return `${riderId}:${date}`;
}

/** The zero-valued ledger returned for a rider-day with no collections yet. */
function emptyLedger(riderId: string, date: string): CashLedgerEntry {
  return {
    riderId,
    date,
    totalDue: 0,
    totalCollected: 0,
    totalRemitted: 0,
    variance: 0,
    collectionIds: [],
    status: 'OPEN',
  };
}

// ─── COD service ──────────────────────────────────────────────────────────────
//
// The cash ledger is the record of how much a rider took in on a given day and
// how much of it they handed back. It was a Map, so a restart wiped every
// open day's takings — and with them the variance that would have flagged a
// rider who was short.

export class CodService {
  constructor(
    private readonly repo: ICodRepository = prismaCodRepository,
    private readonly fulfillments: FulfillmentService = fulfillmentService,
  ) {}

  /**
   * Mark a parcel cash-on-delivery and set what the rider must collect.
   *
   * Ownership is checked before anything is written. This took only a
   * fulfillment id: the route carried `requireAuth` and nothing else, so any
   * authenticated caller — a customer included — could flag any seller's parcel
   * COD with an `amountDue` of their choosing. That figure is what
   * `collectCash` measures the rider's cash against, so setting it wrong is how
   * a collection comes out VERIFIED while being short.
   *
   * The rider is deliberately NOT allowed here, even though `mayTouch` would
   * let them move the parcel: a rider setting their own amount due is the same
   * hole from the other side. Seller, staff, or an internal caller only.
   */
  async flagAsCod(
    fulfillmentId: string,
    amountDue: number,
    currency: string,
    actor: FulfillmentActor,
  ) {
    if (!(amountDue > 0)) throw new CodError('amountDue must be greater than 0');
    const fulfillment = await this.fulfillments.getFulfillment(fulfillmentId);
    if (!fulfillment) throw new CodError('Fulfillment not found', 404);

    // Required rather than optional: an omitted actor would be an unguarded
    // call, and the compiler naming every call site is what keeps that from
    // happening quietly. Same 404 for "not yours" as for "no such parcel", so
    // this cannot be used to discover which fulfillment ids exist.
    if (!(actor.isStaff || fulfillment.sellerId === actor.id)) {
      throw new CodError('Fulfillment not found', 404);
    }

    // Was four field assignments on the object fulfillmentService returned,
    // which "persisted" only because it was the same array element.
    const updated = await this.fulfillments.repository.update(fulfillmentId, {
      paymentMethod: 'COD',
      codAmountDue: amountDue,
      codStatus: 'PENDING',
      codCurrency: currency,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new CodError('Fulfillment not found', 404);

    return updated;
  }

  async collectCash(
    fulfillmentId: string,
    riderId: string,
    amountCollected: number,
    notes?: string,
  ): Promise<CodCollection> {
    if (!(amountCollected >= 0)) throw new CodError('amountCollected must be a non-negative number');
    const fulfillment = await this.fulfillments.getFulfillment(fulfillmentId);
    if (!fulfillment) throw new CodError('Fulfillment not found', 404);
    if (fulfillment.paymentMethod !== 'COD') throw new CodError('Fulfillment is not flagged for cash-on-delivery');
    if (fulfillment.riderId && fulfillment.riderId !== riderId) throw new CodError('This package is assigned to a different rider', 403);

    const amountDue = fulfillment.codAmountDue ?? 0;
    const variance = Math.round((amountCollected - amountDue) * 100) / 100;
    let verificationStatus: CodVerificationStatus;
    if (Math.abs(variance) <= VARIANCE_TOLERANCE) verificationStatus = 'VERIFIED';
    else if (variance < 0) verificationStatus = 'SHORT';
    else verificationStatus = 'DISPUTED';

    const collection: CodCollection = {
      id: randomUUID(),
      fulfillmentId,
      orderId: fulfillment.orderId,
      riderId,
      amountDue,
      amountCollected,
      currency: fulfillment.codCurrency ?? 'UGX',
      variance,
      verificationStatus,
      notes,
      collectedAt: new Date().toISOString(),
    };

    // Cash record first: if anything below fails, the collection is still on
    // the books rather than money having been taken with no trace of it.
    const saved = await this.repo.createCollection(collection);

    await this.fulfillments.repository.update(fulfillmentId, {
      codAmountCollected: (fulfillment.codAmountCollected ?? 0) + amountCollected,
      codStatus: verificationStatus,
      updatedAt: new Date().toISOString(),
    });

    const date = eatDateString();
    await this.repo.accumulateLedger(
      ledgerKey(riderId, date),
      riderId,
      date,
      amountDue,
      amountCollected,
      saved.id,
    );

    return saved;
  }

  /** Now async — the ledger is a query, not a Map lookup. */
  async getRiderLedger(riderId: string, date: string): Promise<CashLedgerEntry> {
    // A rider-day with no collections still answers, with zeroes, as before.
    return (await this.repo.findLedger(ledgerKey(riderId, date))) ?? emptyLedger(riderId, date);
  }

  async reconcileLedger(
    riderId: string,
    date: string,
    remittedAmount: number,
    reconciledBy: string,
  ): Promise<CashLedgerEntry> {
    const key = ledgerKey(riderId, date);
    const entry = await this.repo.findLedger(key);
    if (!entry) throw new CodError('No cash collections recorded for this rider on this date', 404);

    const variance = Math.round((entry.totalCollected - remittedAmount) * 100) / 100;

    const updated = await this.repo.updateLedgerReconciliation(key, {
      totalRemitted: remittedAmount,
      variance,
      // Anything other than an exact match is flagged for a human.
      status: variance === 0 ? 'RECONCILED' : 'FLAGGED',
      reconciledAt: new Date().toISOString(),
      reconciledBy,
    });
    if (!updated) throw new CodError('No cash collections recorded for this rider on this date', 404);

    return updated;
  }

  async listPendingReconciliations(): Promise<CashLedgerEntry[]> {
    return this.repo.listUnreconciledLedgers();
  }
}

export const codService = new CodService();
