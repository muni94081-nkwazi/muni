import type { Fulfillment } from '../models/fulfillment.model.js';
import type { CashLedgerEntry, CodCollection } from '../models/cod.model.js';
import type { DigitalSignature, Rider } from '../models/rider.model.js';
import type {
  FulfillmentUpdate,
  ICodRepository,
  IFulfillmentRepository,
  IRiderRepository,
  TimelineEntry,
} from '../types/repositories.js';

// ─── In-memory repositories ───────────────────────────────────────────────────
//
// For tests, and for running without a database. Reads return structuredClones
// so a caller that mutates what it received changes nothing — which is the
// whole point here, because the bug this migration fixes was three services
// quietly mutating each other's objects.

function applyPatch<T extends object, P extends object>(target: T, patch: P): void {
  for (const key of Object.keys(patch) as (keyof P)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    Object.assign(target, { [key]: value });
  }
}

export class MemoryFulfillmentRepository implements IFulfillmentRepository {
  private readonly store = new Map<string, Fulfillment>();
  /** Signatures live here so the fulfillment's list can be derived, as in Prisma. */
  readonly signatures: DigitalSignature[] = [];

  clear(): void {
    this.store.clear();
    this.signatures.length = 0;
  }

  private hydrate(f: Fulfillment): Fulfillment {
    const clone = structuredClone(f);
    clone.signatures = this.signatures
      .filter((s) => s.fulfillmentId === f.id)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      .map((s) => ({
        id: s.id,
        riderId: s.riderId,
        signatureData: s.signatureData,
        recipientName: s.recipientName,
        capturedAt: s.capturedAt,
      }));
    return clone;
  }

  async create(f: Fulfillment): Promise<Fulfillment> {
    this.store.set(f.id, structuredClone(f));
    return this.hydrate(f);
  }

  async findById(id: string): Promise<Fulfillment | null> {
    const found = this.store.get(id);
    return found ? this.hydrate(found) : null;
  }

  async findByOrder(orderId: string): Promise<Fulfillment[]> {
    return this.filtered((f) => f.orderId === orderId);
  }

  async findBySubOrder(subOrderId: string): Promise<Fulfillment | null> {
    return (await this.filtered((f) => f.subOrderId === subOrderId))[0] ?? null;
  }

  async findBySeller(sellerId: string): Promise<Fulfillment[]> {
    return this.filtered((f) => f.sellerId === sellerId);
  }

  async findByRider(riderId: string): Promise<Fulfillment[]> {
    return this.filtered((f) => f.riderId === riderId);
  }

  async update(id: string, patch: FulfillmentUpdate): Promise<Fulfillment | null> {
    const current = this.store.get(id);
    if (!current) return null;
    applyPatch(current, patch);
    return this.hydrate(current);
  }

  async appendTimeline(
    id: string,
    entry: TimelineEntry,
    patch?: FulfillmentUpdate,
  ): Promise<Fulfillment | null> {
    const current = this.store.get(id);
    if (!current) return null;
    current.timeline.push(entry);
    if (patch) applyPatch(current, patch);
    return this.hydrate(current);
  }

  async setLastTimelineNote(id: string, note: string): Promise<Fulfillment | null> {
    const current = this.store.get(id);
    if (!current) return null;
    if (current.timeline.length > 0) current.timeline[current.timeline.length - 1]!.note = note;
    return this.hydrate(current);
  }

  private filtered(predicate: (f: Fulfillment) => boolean): Fulfillment[] {
    return [...this.store.values()].filter(predicate).map((f) => this.hydrate(f));
  }
}

export class MemoryCodRepository implements ICodRepository {
  private readonly collections: CodCollection[] = [];
  private readonly ledgers = new Map<string, CashLedgerEntry>();

  clear(): void {
    this.collections.length = 0;
    this.ledgers.clear();
  }

  async createCollection(c: CodCollection): Promise<CodCollection> {
    this.collections.push(structuredClone(c));
    return structuredClone(c);
  }

  async findLedger(ledgerKey: string): Promise<CashLedgerEntry | null> {
    const found = this.ledgers.get(ledgerKey);
    return found ? structuredClone(found) : null;
  }

  async accumulateLedger(
    ledgerKey: string,
    riderId: string,
    date: string,
    amountDue: number,
    amountCollected: number,
    collectionId: string,
  ): Promise<CashLedgerEntry> {
    const entry = this.ledgers.get(ledgerKey) ?? {
      riderId,
      date,
      totalDue: 0,
      totalCollected: 0,
      totalRemitted: 0,
      variance: 0,
      collectionIds: [],
      status: 'OPEN' as const,
    };

    entry.totalDue += amountDue;
    entry.totalCollected += amountCollected;
    entry.collectionIds.push(collectionId);

    this.ledgers.set(ledgerKey, entry);
    return structuredClone(entry);
  }

  async updateLedgerReconciliation(
    ledgerKey: string,
    patch: Pick<
      CashLedgerEntry,
      'totalRemitted' | 'variance' | 'status' | 'reconciledAt' | 'reconciledBy'
    >,
  ): Promise<CashLedgerEntry | null> {
    const entry = this.ledgers.get(ledgerKey);
    if (!entry) return null;
    applyPatch(entry, patch);
    return structuredClone(entry);
  }

  async listUnreconciledLedgers(): Promise<CashLedgerEntry[]> {
    return [...this.ledgers.values()]
      .filter((e) => e.status !== 'RECONCILED')
      .map((e) => structuredClone(e));
  }
}

export class MemoryRiderRepository implements IRiderRepository {
  private readonly riders = new Map<string, Rider>();

  /**
   * Signatures are one table in Prisma, shared between the rider repository
   * that writes them and the fulfillment repository that derives
   * `fulfillment.signatures` from them. Passing the same array in keeps that
   * true here — otherwise logSignature() would write to a list nothing reads,
   * and the tests would pass while production silently disagreed.
   */
  constructor(private readonly signatures: DigitalSignature[] = []) {}

  clear(): void {
    this.riders.clear();
    this.signatures.length = 0;
  }

  async ensure(riderId: string): Promise<Rider> {
    let rider = this.riders.get(riderId);
    if (!rider) {
      const now = new Date().toISOString();
      rider = {
        id: riderId,
        vehicleType: 'BODA',
        status: 'AVAILABLE',
        activeFulfillmentIds: [],
        createdAt: now,
        updatedAt: now,
      };
      this.riders.set(riderId, rider);
    }
    return structuredClone(rider);
  }

  async findById(riderId: string): Promise<Rider | null> {
    const found = this.riders.get(riderId);
    return found ? structuredClone(found) : null;
  }

  async update(
    riderId: string,
    patch: Partial<Pick<Rider, 'name' | 'phone' | 'vehicleType' | 'status' | 'activeFulfillmentIds' | 'updatedAt'>>,
  ): Promise<Rider | null> {
    const current = this.riders.get(riderId);
    if (!current) return null;
    applyPatch(current, patch);
    return structuredClone(current);
  }

  async createSignature(s: DigitalSignature): Promise<DigitalSignature> {
    this.signatures.push(structuredClone(s));
    return structuredClone(s);
  }
}
