// ─── Escrow Payout Hold — seller payout protection ───────────────────────────
//
// One hold record per order (or sub-order, for split multi-vendor carts —
// see `subOrderId`). Money itself is moved by payment-service (see its
// `EscrowHoldEntry` ledger); this service is the *policy* layer that decides
// WHEN a hold should release: on buyer confirmation, on the 7-day
// no-dispute timer after verified delivery, or never (while a dispute is
// open) until dispute-service tells us to resolve one way or the other.

export type EscrowHoldStatus =
  | 'HELD'           // funds locked, no release condition met yet
  | 'DISPUTE_HELD'    // an open dispute is blocking any release
  | 'RELEASED'         // paid out to the seller
  | 'REFUNDED';         // returned to the buyer (dispute resolved in their favor)

export type ReleaseTrigger = 'BUYER_CONFIRMED' | 'AUTO_7_DAY' | 'ADMIN_OVERRIDE' | 'DISPUTE_RESOLVED_SELLER_FAVOR';
export type RefundTrigger = 'DISPUTE_RESOLVED_BUYER_FAVOR' | 'ADMIN_OVERRIDE';

export interface EscrowHold {
  id: string;
  orderId: string;
  subOrderId?: string | null;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: EscrowHoldStatus;

  /** Set once shipping/fulfillment confirms delivery — starts the 7-day auto-release clock. */
  deliveredAt?: string | null;
  /** deliveredAt + 7 days. Null until deliveredAt is known. Recomputed if a dispute hold is lifted after this date already passed. */
  autoReleaseAt?: string | null;
  /** Optional: shipping-service's promised delivery date, used to feed the seller's on-time-delivery trust signal. */
  expectedDeliveryAt?: string | null;

  /** Set while status is DISPUTE_HELD. */
  activeDisputeId?: string | null;

  releasedAt?: string | null;
  releaseTrigger?: ReleaseTrigger | null;
  refundedAt?: string | null;
  refundTrigger?: RefundTrigger | null;

  createdAt: string;
  updatedAt: string;
}

export interface CreateEscrowHoldInput {
  orderId: string;
  subOrderId?: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency?: string;
}
