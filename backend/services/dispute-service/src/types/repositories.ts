import type { Dispute, DisputeEvidence, DisputeMessage } from '../models/dispute.model.js';

// ─── Repository contracts ─────────────────────────────────────────────────────
//
// DisputeService depends on this interface, never on Prisma directly, so the
// same service logic runs against Postgres in production and an in-memory Map
// in tests. Mirrors the shape order-service already uses for IOrderRepository.
//
// One rule shapes every signature here: the old Map-backed service mutated the
// dispute object it had fetched and relied on reference semantics for the
// change to "persist". Nothing persists implicitly against a database, so every
// state change is an explicit call that returns the updated row.

/** Fields a caller may change after the dispute exists. */
export type DisputeUpdate = Partial<
  Pick<
    Dispute,
    | 'status'
    | 'resolutionAction'
    | 'refundAmountUGX'
    | 'resolutionNote'
    | 'slaStatus'
    | 'autoEscalated'
    | 'adminId'
    | 'escalatedAt'
    | 'resolvedAt'
    | 'updatedAt'
  >
>;

/** A message to append, without the id the repository assigns. */
export type NewDisputeMessage = Omit<DisputeMessage, 'id'>;

export interface IDisputeRepository {
  /** Persist a brand-new dispute together with its opening message. */
  create(dispute: Dispute): Promise<Dispute>;

  findById(id: string): Promise<Dispute | null>;

  findByUser(userId: string, role: 'buyer' | 'seller'): Promise<Dispute[]>;

  /** Every dispute, for the admin dashboard's aggregate counts. */
  findAll(): Promise<Dispute[]>;

  /**
   * Disputes still inside the seller-resolution window — status OPENED or
   * SELLER_RESPONDED. The SLA sweep's candidate set; deliberately a narrow
   * query rather than findAll() + filter, because it runs on a timer forever.
   */
  findSlaCandidates(): Promise<Dispute[]>;

  /** Returns null if the dispute no longer exists. */
  update(id: string, patch: DisputeUpdate): Promise<Dispute | null>;

  /** Appends evidence items to the dispute's JSON evidence array. */
  appendEvidence(id: string, items: DisputeEvidence[], updatedAt: string): Promise<Dispute | null>;

  /** Appends a message, optionally applying a status patch in the same write. */
  appendMessage(id: string, message: NewDisputeMessage, patch?: DisputeUpdate): Promise<Dispute | null>;
}
