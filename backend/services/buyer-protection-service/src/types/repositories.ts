import type { ProtectionClaim } from '../models/buyer-protection.model.js';
import type { EscrowHold } from '../models/escrow-hold.model.js';

// ─── Repository contracts ─────────────────────────────────────────────────────
//
// Two aggregates, two contracts. Both services depend on these rather than on
// Prisma, so the same logic runs against Postgres in production and in-memory
// Maps in tests.

export type ClaimUpdate = Partial<
  Pick<ProtectionClaim, 'status' | 'adminNotes' | 'resolutionNotes' | 'resolvedAt'>
>;

export interface IClaimRepository {
  create(claim: ProtectionClaim): Promise<ProtectionClaim>;
  findById(id: string): Promise<ProtectionClaim | null>;
  findByUser(userId: string): Promise<ProtectionClaim[]>;
  findAll(): Promise<ProtectionClaim[]>;
  update(id: string, patch: ClaimUpdate): Promise<ProtectionClaim | null>;
}

/** Fields the escrow state machine may change after a hold exists. */
export type EscrowHoldUpdate = Partial<
  Pick<
    EscrowHold,
    | 'status'
    | 'deliveredAt'
    | 'autoReleaseAt'
    | 'expectedDeliveryAt'
    | 'activeDisputeId'
    | 'releasedAt'
    | 'releaseTrigger'
    | 'refundedAt'
    | 'refundTrigger'
    | 'updatedAt'
  >
>;

export interface IEscrowHoldRepository {
  /**
   * Insert or replace the hold for this key.
   *
   * Deliberately an upsert, not an insert: the Map version used
   * `holdStore.set(key, hold)`, which silently replaced any existing hold for
   * the same order. Turning that into a duplicate-key error would be a
   * behaviour change. See the warning on EscrowHoldService.createHold.
   */
  upsert(hold: EscrowHold): Promise<EscrowHold>;

  /** Lookup by the composite key the service uses everywhere. */
  findByKey(holdKey: string): Promise<EscrowHold | null>;

  findAll(): Promise<EscrowHold[]>;

  findBySeller(sellerId: string): Promise<EscrowHold[]>;

  /** HELD holds whose auto-release clock has already expired. */
  findDueForAutoRelease(now: string): Promise<EscrowHold[]>;

  update(holdKey: string, patch: EscrowHoldUpdate): Promise<EscrowHold | null>;
}
