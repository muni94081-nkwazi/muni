import type { ProtectionClaim } from '../models/buyer-protection.model.js';
import type { EscrowHold } from '../models/escrow-hold.model.js';
import type {
  ClaimUpdate,
  EscrowHoldUpdate,
  IClaimRepository,
  IEscrowHoldRepository,
} from '../types/repositories.js';
import { holdKeyFor } from './prisma-buyer-protection.repository.js';

// ─── In-memory repositories ───────────────────────────────────────────────────
//
// For tests, and for running without a database. These are where `claimsStore`
// and `holdStore` ended up — now one implementation behind an explicit choice
// rather than the only way the services could store anything.
//
// Reads return structuredClones, so a caller that mutates what it received
// changes nothing — matching the Prisma repositories, which build a fresh
// object from a row every time.

function applyPatch<T extends object, P extends object>(target: T, patch: P): void {
  for (const key of Object.keys(patch) as (keyof P)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    Object.assign(target, { [key]: value });
  }
}

export class MemoryClaimRepository implements IClaimRepository {
  private readonly store = new Map<string, ProtectionClaim>();

  clear(): void {
    this.store.clear();
  }

  async create(claim: ProtectionClaim): Promise<ProtectionClaim> {
    this.store.set(claim.id, structuredClone(claim));
    return structuredClone(claim);
  }

  async findById(id: string): Promise<ProtectionClaim | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByUser(userId: string): Promise<ProtectionClaim[]> {
    return this.sorted((c) => c.userId === userId);
  }

  async findAll(): Promise<ProtectionClaim[]> {
    return this.sorted(() => true);
  }

  async update(id: string, patch: ClaimUpdate): Promise<ProtectionClaim | null> {
    const current = this.store.get(id);
    if (!current) return null;
    applyPatch(current, patch);
    return structuredClone(current);
  }

  private sorted(predicate: (c: ProtectionClaim) => boolean): ProtectionClaim[] {
    return [...this.store.values()]
      .filter(predicate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => structuredClone(c));
  }
}

export class MemoryEscrowHoldRepository implements IEscrowHoldRepository {
  private readonly store = new Map<string, EscrowHold>();

  clear(): void {
    this.store.clear();
  }

  /** Test helper: insert a hold directly, bypassing createHold(). */
  seed(hold: EscrowHold): void {
    this.store.set(holdKeyFor(hold.orderId, hold.subOrderId), structuredClone(hold));
  }

  async upsert(hold: EscrowHold): Promise<EscrowHold> {
    // Replaces on collision, exactly as holdStore.set() did.
    this.store.set(holdKeyFor(hold.orderId, hold.subOrderId), structuredClone(hold));
    return structuredClone(hold);
  }

  async findByKey(holdKey: string): Promise<EscrowHold | null> {
    const found = this.store.get(holdKey);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<EscrowHold[]> {
    return [...this.store.values()].map((h) => structuredClone(h));
  }

  async findBySeller(sellerId: string): Promise<EscrowHold[]> {
    return [...this.store.values()]
      .filter((h) => h.sellerId === sellerId)
      .map((h) => structuredClone(h));
  }

  async findDueForAutoRelease(now: string): Promise<EscrowHold[]> {
    const cutoff = new Date(now).getTime();
    return [...this.store.values()]
      .filter(
        (h) => h.status === 'HELD' && h.autoReleaseAt && new Date(h.autoReleaseAt).getTime() <= cutoff,
      )
      .sort((a, b) => (a.autoReleaseAt ?? '').localeCompare(b.autoReleaseAt ?? ''))
      .map((h) => structuredClone(h));
  }

  async update(holdKey: string, patch: EscrowHoldUpdate): Promise<EscrowHold | null> {
    const current = this.store.get(holdKey);
    if (!current) return null;
    applyPatch(current, patch);
    return structuredClone(current);
  }
}
