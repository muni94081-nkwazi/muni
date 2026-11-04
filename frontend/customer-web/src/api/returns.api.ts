import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';

// ─── Returns API ──────────────────────────────────────────────────────────────
//
// return-service through the gateway's `auth('/returns')` mount, which verifies
// the JWT and stamps the caller's id downstream. No customer id is ever sent
// from here: the service scopes list/read/cancel to the stamped identity.
//
// Note what is deliberately absent: there is no refundAmount on the create
// payload. ReturnRequestSchema in return-service does not define one and Zod
// drops unknown keys, so a browser cannot propose what it should be refunded —
// the old page asked the customer to type the figure themselves.
//
// Shapes mirror mobile/src/api/returns.api.ts, which already speaks this
// contract correctly.

export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CANCELLED';

/**
 * The reasons a customer can give. return-service exports an
 * AUTO_APPROVE_REASONS list of its own, but createReturn tests it against a
 * top-level `reason` that ReturnRequestSchema does not define — so it is always
 * undefined and auto-approval never fires. Verified end to end: a DEFECTIVE
 * return comes back REQUESTED with isAutoApproved false. The UI therefore
 * promises no customer that any reason is approved automatically.
 */
export const RETURN_REASONS = [
  'DEFECTIVE',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'DAMAGED_IN_SHIPPING',
  'CHANGED_MIND',
  'ARRIVED_LATE',
  'OTHER',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export interface ReturnItemInput {
  orderItemId: string;
  quantity: number;
  reason: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  userId: string;
  sellerId: string;
  items: ReturnItemInput[];
  description?: string;
  refundMethod: string;
  /** Null in practice today — see the note in return.service.ts. */
  refundAmount?: number | null;
  currency?: string | null;
  status: ReturnStatus;
  isAutoApproved?: boolean;
  guaranteeBadge?: string | null;
  requestedAt?: string;
  approvedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface CreateReturnInput {
  orderId: string;
  sellerId: string;
  items: ReturnItemInput[];
  description?: string;
  refundMethod: string;
}

export interface GuaranteeEligibility {
  orderId: string;
  isEligible: boolean;
  windowDaysRemaining: number;
  guaranteeLabel: string;
}

export const returnsApi = {
  /** The signed-in customer's own returns. */
  async list(): Promise<ReturnRequest[]> {
    const { data } = await apiClient.get<ApiEnvelope<ReturnRequest[]>>('/returns');
    return data.data;
  },

  async create(input: CreateReturnInput): Promise<ReturnRequest> {
    const { data } = await apiClient.post<ApiEnvelope<ReturnRequest>>('/returns', input);
    return data.data;
  },

  /**
   * Cancel a return. The service allows this only from REQUESTED and only for
   * the customer who raised it; anything else answers 409 or 404.
   */
  async cancel(id: string): Promise<ReturnRequest> {
    const { data } = await apiClient.patch<ApiEnvelope<ReturnRequest>>(`/returns/${id}/cancel`);
    return data.data;
  },

  async guaranteeStatus(orderId: string): Promise<GuaranteeEligibility> {
    const { data } = await apiClient.get<ApiEnvelope<GuaranteeEligibility>>(
      `/returns/guarantee-status/${encodeURIComponent(orderId)}`,
    );
    return data.data;
  },
};
