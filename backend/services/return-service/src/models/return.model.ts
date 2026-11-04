import { z } from 'zod';

export const ReturnRequestSchema = z.object({
  orderId: z.string(),
  sellerId: z.string(),
  items: z.array(z.object({
    orderItemId: z.string(),
    quantity: z.number(),
    reason: z.string()
  })),
  description: z.string().optional(),
  refundMethod: z.string()
});

// ─── Domain types ─────────────────────────────────────────────────────────────
//
// The service used to be `Map<string, any>` and every function signature was
// `any`. Persisting it needs a real shape, so these describe exactly what the
// old code stored — nothing has been added or renamed.

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REFUNDED'
  | 'CANCELLED';

/** Reasons that skip manual seller review under the 14-day guarantee. */
export const AUTO_APPROVE_REASONS = [
  'DEFECTIVE',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'DAMAGED_IN_SHIPPING',
] as const;

export const GUARANTEE_WINDOW_DAYS = 14;

export interface ReturnItem {
  orderItemId: string;
  quantity: number;
  reason: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  userId: string;
  sellerId: string;
  items: ReturnItem[];
  description?: string;
  refundMethod: string;

  /**
   * Nullable, and in practice always null for anything a client actually
   * submitted: ReturnRequestSchema above has no refundAmount field, so the
   * validated payload createReturn() spreads never carries one. Only the old
   * hardcoded seed row had a value.
   *
   * This is preserved rather than papered over — every auto-approved return
   * publishes `refund.initiated` with an undefined amount today, and inventing
   * a number here would turn a visible gap into a plausible-looking wrong
   * figure. Fixing it properly means sourcing the amount from order-service,
   * which is a separate change.
   */
  refundAmount?: number | null;
  currency?: string | null;

  status: ReturnStatus;
  isAutoApproved: boolean;
  guaranteeBadge: string;

  requestedAt: string;
  approvedAt?: string | null;
  updatedAt: string;
}

export interface GuaranteeEligibility {
  orderId: string;
  isEligible: boolean;
  windowDaysRemaining: number;
  guaranteeLabel: string;
}
