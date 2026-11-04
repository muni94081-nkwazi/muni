import { apiClient, type ApiEnvelope } from './client';

// return-service and dispute-service both envelope their responses.
// Gateway: `auth('/returns', targets.returns)` and `auth('/disputes', targets.dispute)`.

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REFUNDED'
  | 'CANCELLED';

/**
 * Reasons that bypass manual seller review under the 14-day guarantee. Kept in
 * sync with AUTO_APPROVE_REASONS in return-service; the service is the
 * authority, this list only lets the UI say "usually approved automatically".
 */
export const AUTO_APPROVE_REASONS = [
  'DEFECTIVE',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'DAMAGED_IN_SHIPPING',
] as const;

export const RETURN_REASONS = [
  ...AUTO_APPROVE_REASONS,
  'CHANGED_MIND',
  'ARRIVED_LATE',
  'OTHER',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

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
  refundAmount?: number | null;
  status: ReturnStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateReturnInput {
  orderId: string;
  sellerId: string;
  items: ReturnItem[];
  description?: string;
  refundMethod: string;
}

export interface GuaranteeStatus {
  eligible: boolean;
  daysRemaining?: number;
  [key: string]: unknown;
}

export interface Dispute {
  id: string;
  orderId: string;
  status: string;
  reason?: string;
  createdAt: string;
  [key: string]: unknown;
}

export const returnsApi = {
  list: async (): Promise<ReturnRequest[]> => {
    const { data } = await apiClient.get<ApiEnvelope<ReturnRequest[]>>('/api/v1/returns');
    return data.data;
  },

  getById: async (id: string): Promise<ReturnRequest> => {
    const { data } = await apiClient.get<ApiEnvelope<ReturnRequest>>(`/api/v1/returns/${id}`);
    return data.data;
  },

  create: async (input: CreateReturnInput): Promise<ReturnRequest> => {
    const { data } = await apiClient.post<ApiEnvelope<ReturnRequest>>('/api/v1/returns', input);
    return data.data;
  },

  cancel: async (id: string): Promise<ReturnRequest> => {
    const { data } = await apiClient.patch<ApiEnvelope<ReturnRequest>>(
      `/api/v1/returns/${id}/cancel`,
    );
    return data.data;
  },

  /** Whether an order is still inside the 14-day guarantee window. */
  guaranteeStatus: async (orderId: string): Promise<GuaranteeStatus> => {
    const { data } = await apiClient.get<ApiEnvelope<GuaranteeStatus>>(
      `/api/v1/returns/guarantee-status/${orderId}`,
    );
    return data.data;
  },

  /**
   * Disputes are a separate service (dispute-service) reached under its own
   * gateway prefix. Listed alongside returns because the two are one concern to
   * a buyer: "something went wrong with this order".
   */
  listDisputes: async (): Promise<Dispute[]> => {
    const { data } = await apiClient.get<ApiEnvelope<Dispute[]>>('/api/v1/disputes');
    return data.data;
  },
};
