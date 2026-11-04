import type { Fulfillment } from '../models/fulfillment.model.js';
import type { CashLedgerEntry, CodCollection } from '../models/cod.model.js';
import type { DigitalSignature, Rider } from '../models/rider.model.js';

// ─── Repository contracts ─────────────────────────────────────────────────────
//
// Three services share one database here, and they used to share it by sharing
// object references: codService and riderService both mutated the Fulfillment
// object fulfillmentService handed them, and the change "persisted" because it
// was the same array element. Nothing persists implicitly against a database,
// so every one of those mutations is now an explicit call through these
// contracts.

export type TimelineEntry = { status: string; timestamp: string; note?: string };

/** Fields a caller may change on a fulfillment after it exists. */
export type FulfillmentUpdate = Partial<
  Pick<
    Fulfillment,
    | 'status'
    | 'trackingNumber'
    | 'riderId'
    | 'paymentMethod'
    | 'codAmountDue'
    | 'codAmountCollected'
    | 'codCurrency'
    | 'codStatus'
    | 'updatedAt'
  >
>;

export interface IFulfillmentRepository {
  create(fulfillment: Fulfillment): Promise<Fulfillment>;
  findById(id: string): Promise<Fulfillment | null>;
  findByOrder(orderId: string): Promise<Fulfillment[]>;
  /** The one delivery job for this sub-order, if it has been booked. */
  findBySubOrder(subOrderId: string): Promise<Fulfillment | null>;
  findBySeller(sellerId: string): Promise<Fulfillment[]>;
  findByRider(riderId: string): Promise<Fulfillment[]>;

  update(id: string, patch: FulfillmentUpdate): Promise<Fulfillment | null>;

  /**
   * Append one timeline entry, optionally applying a patch in the same write.
   * A status change and the timeline row recording it must never be
   * separately observable.
   */
  appendTimeline(
    id: string,
    entry: TimelineEntry,
    patch?: FulfillmentUpdate,
  ): Promise<Fulfillment | null>;

  /**
   * Overwrite the note on the most recent timeline entry.
   *
   * Exists only because updateDeliveryStatus() sets the return reason by
   * reaching into `timeline[timeline.length - 1].note` after calling
   * updateStatus(). Kept as its own method rather than folded into
   * appendTimeline so that odd two-step remains visible instead of being
   * quietly restructured.
   */
  setLastTimelineNote(id: string, note: string): Promise<Fulfillment | null>;
}

export interface ICodRepository {
  createCollection(collection: CodCollection): Promise<CodCollection>;

  findLedger(ledgerKey: string): Promise<CashLedgerEntry | null>;

  /**
   * Add one collection's totals to a rider's day, creating the row if it is
   * the first collection of that day. A single upsert rather than
   * read-then-write: two riders' handsets posting at once would otherwise
   * both read the same totals and one increment would be lost.
   */
  accumulateLedger(
    ledgerKey: string,
    riderId: string,
    date: string,
    amountDue: number,
    amountCollected: number,
    collectionId: string,
  ): Promise<CashLedgerEntry>;

  updateLedgerReconciliation(
    ledgerKey: string,
    patch: Pick<
      CashLedgerEntry,
      'totalRemitted' | 'variance' | 'status' | 'reconciledAt' | 'reconciledBy'
    >,
  ): Promise<CashLedgerEntry | null>;

  listUnreconciledLedgers(): Promise<CashLedgerEntry[]>;
}

export interface IRiderRepository {
  /** Fetch the rider, creating a default AVAILABLE record if none exists. */
  ensure(riderId: string): Promise<Rider>;

  findById(riderId: string): Promise<Rider | null>;

  update(
    riderId: string,
    patch: Partial<Pick<Rider, 'name' | 'phone' | 'vehicleType' | 'status' | 'activeFulfillmentIds' | 'updatedAt'>>,
  ): Promise<Rider | null>;

  createSignature(signature: DigitalSignature): Promise<DigitalSignature>;
}
