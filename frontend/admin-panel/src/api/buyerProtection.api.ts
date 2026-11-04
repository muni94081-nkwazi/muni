import { apiClient } from './axios.config';
import type { ClaimStatus, ProtectionClaim, RefundDecision } from '@/types/buyerProtection.types';
import type { ApiEnvelope, PaginatedResponse } from '@/types/api.types';

// ─── Buyer-protection claims ──────────────────────────────────────────────────
//
// Backed by buyer-protection-service:
//   GET   /api/v1/buyer-protection/admin/claims
//   PATCH /api/v1/buyer-protection/claims/:id/resolve
//
// This was a module-level mock "database" seeded with sixteen generated claims;
// decisions lasted until the tab was closed and no buyer was ever refunded.

/** buyer-protection-service's wire shape. */
interface ClaimDto {
  id: string;
  claimNumber: string;
  orderId: string;
  userId: string;
  productId: string;
  reason: string;
  claimAmountUGX: number | string;
  status: 'FILED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  adminNotes?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

/**
 * The panel models five claim states; the backend has four.
 *
 * `evidence_requested` has no backend equivalent — the service tracks an
 * evidence request as admin notes on a claim still UNDER_REVIEW, so a claim in
 * that state comes back as `under_review`. Round-tripping it would need a
 * status the backend does not have.
 */
const STATUS_FROM_BACKEND: Record<ClaimDto['status'], ClaimStatus> = {
  FILED:        'open',
  UNDER_REVIEW: 'under_review',
  APPROVED:     'resolved_refund',
  REJECTED:     'resolved_denied',
};

const STATUS_TO_BACKEND: Partial<Record<ClaimStatus, ClaimDto['status']>> = {
  open:             'FILED',
  under_review:     'UNDER_REVIEW',
  resolved_refund:  'APPROVED',
  resolved_denied:  'REJECTED',
};

function decisionToStatus(decision: RefundDecision): ClaimStatus {
  switch (decision) {
    case 'full_refund':
    case 'partial_refund':
    case 'chargeback_release':
      return 'resolved_refund';
    case 'deny':
      return 'resolved_denied';
    default:
      return 'under_review';
  }
}

function toClaim(dto: ClaimDto): ProtectionClaim {
  return {
    id:         dto.id,
    orderId:    dto.orderId,
    // The service stores ids, not names — resolving them needs a join across
    // auth-service the claims endpoint does not do. Showing the id beats
    // inventing a name that does not correspond to anyone.
    buyerName:  dto.userId,
    sellerName: dto.productId,
    reason:     dto.reason,
    // Prisma serialises Decimal as a string.
    amount:     Number(dto.claimAmountUGX ?? 0),
    currency:   'UGX',
    status:     STATUS_FROM_BACKEND[dto.status] ?? 'open',
    openedAt:   dto.createdAt,
    // Evidence is not modelled in buyer-protection-service; the panel's
    // evidence vault renders empty rather than showing fabricated documents.
    evidence:   [],
  };
}

export const buyerProtectionApi = {
  /**
   * The claims desk.
   *
   * The admin endpoint returns every claim unpaginated, so filtering and
   * paging happen here. Worth revisiting if claim volume grows — the shape
   * below is already what a server-paged endpoint would return.
   */
  list: async (
    page = 1,
    pageSize = 50,
    status?: string,
  ): Promise<ApiEnvelope<PaginatedResponse<ProtectionClaim>>> => {
    const { data } = await apiClient.get<ApiEnvelope<ClaimDto[]>>(
      '/buyer-protection/admin/claims',
    );

    const all = (data.data ?? [])
      .map(toClaim)
      .filter((c) => !status || status === 'all' || c.status === status);

    const start = (page - 1) * pageSize;

    return {
      success: true,
      data: {
        items:      all.slice(start, start + pageSize),
        total:      all.length,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
      },
    };
  },

  getById: async (id: string): Promise<ApiEnvelope<ProtectionClaim>> => {
    // No single-claim admin route exists, so this reads the list and selects.
    const { data } = await apiClient.get<ApiEnvelope<ClaimDto[]>>(
      '/buyer-protection/admin/claims',
    );

    const found = (data.data ?? []).find((c) => c.id === id);
    if (!found) throw new Error(`Claim ${id} not found`);

    return { success: true, data: toClaim(found) };
  },

  /**
   * Resolve a claim.
   *
   * The backend accepts only APPROVED or REJECTED, so a decision that maps to
   * neither (an evidence request) is rejected here rather than sent and 400'd.
   */
  applyDecision: async (
    id: string,
    decision: RefundDecision,
    notes?: string,
  ): Promise<ApiEnvelope<ProtectionClaim>> => {
    const target = decisionToStatus(decision);
    const backendStatus = STATUS_TO_BACKEND[target];

    if (backendStatus !== 'APPROVED' && backendStatus !== 'REJECTED') {
      throw new Error('Only an approve or deny decision can resolve a claim.');
    }

    const { data } = await apiClient.patch<ApiEnvelope<ClaimDto>>(
      `/buyer-protection/claims/${encodeURIComponent(id)}/resolve`,
      { status: backendStatus, resolutionNotes: notes },
    );

    return { success: true, data: toClaim(data.data) };
  },
};
