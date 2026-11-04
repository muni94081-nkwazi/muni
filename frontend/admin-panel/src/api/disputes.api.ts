import { apiClient } from './axios.config';
import type { Dispute, DisputeStatus, DisputeType } from '@/types/dispute.types';
import type { ApiEnvelope, PaginatedResponse } from '@/types/api.types';

// ─── Endpoint reality ─────────────────────────────────────────────────────────
//
// dispute-service exposes, under the gateway's /api/v1/admin:
//
//   GET   /admin/disputes            list (added alongside this client — the
//                                    service had only dashboard metrics before,
//                                    which is why the panel shipped a fixture)
//   PATCH /admin/disputes/:id/resolve  { resolution, note }
//   GET   /admin/disputes/dashboard    aggregate counts
//
// There is no assign-to-agent and no separate close: an admin arbitration IS
// the terminal action, so those two methods reject rather than resolving.

/** dispute-service's Dispute, verbatim. */
interface ServiceDispute {
  id: string;
  disputeNumber: string;
  orderId: string;
  subOrderId?: string | null;
  buyerId: string;
  sellerId: string;
  claimType: 'NON_DELIVERY' | 'DEFECTIVE_ITEM';
  description: string;
  evidence: Array<{ id: string; url: string; caption?: string }>;
  claimAmountUGX: number;
  status:
    | 'OPENED'
    | 'SELLER_RESPONDED'
    | 'UNDER_MEDIATION'
    | 'ARBITRATION'
    | 'RESOLVED_BUYER_FAVOR'
    | 'RESOLVED_SELLER_FAVOR'
    | 'CLOSED';
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

interface ListDisputesResponse {
  success: boolean;
  data: {
    disputes: ServiceDispute[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// The panel models four coarse states; the service models seven precise ones.
// Collapsing is lossy but one-directional and stable — nothing writes back
// through this mapping.
const STATUS_MAP: Record<ServiceDispute['status'], DisputeStatus> = {
  OPENED: 'open',
  SELLER_RESPONDED: 'open',
  UNDER_MEDIATION: 'investigating',
  ARBITRATION: 'investigating',
  RESOLVED_BUYER_FAVOR: 'resolved',
  RESOLVED_SELLER_FAVOR: 'resolved',
  CLOSED: 'closed',
};

const TYPE_MAP: Record<ServiceDispute['claimType'], DisputeType> = {
  NON_DELIVERY: 'item_not_received',
  DEFECTIVE_ITEM: 'damaged',
};

/** The panel filters by its own vocabulary; the service expects its own. */
const STATUS_TO_SERVICE: Record<DisputeStatus, ServiceDispute['status'] | undefined> = {
  open: 'OPENED',
  investigating: 'UNDER_MEDIATION',
  // Two service states collapse to "resolved", so a single value cannot express
  // it. Left unfiltered rather than silently returning only half the resolved
  // disputes.
  resolved: undefined,
  closed: 'CLOSED',
};

function toPanelDispute(d: ServiceDispute): Dispute {
  return {
    id: d.id,
    orderId: d.orderId,
    type: TYPE_MAP[d.claimType] ?? 'other',
    status: STATUS_MAP[d.status] ?? 'open',
    buyerId: d.buyerId,
    sellerId: d.sellerId,
    amount: d.claimAmountUGX,
    // dispute-service settles in UGX only — the field name says so.
    currency: 'UGX',
    description: d.description,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    resolvedAt: d.resolvedAt,
    resolutionNotes: d.resolutionNote,
    evidence: (d.evidence ?? []).map((e) => e.url),
  };
}

function unsupported(what: string, detail: string): Promise<never> {
  return Promise.reject(new Error(`${what} is not supported by the backend — ${detail}`));
}

export const disputesApi = {
  list: async (
    page = 1,
    pageSize = 20,
    status?: string,
  ): Promise<ApiEnvelope<PaginatedResponse<Dispute>>> => {
    const serviceStatus = status ? STATUS_TO_SERVICE[status as DisputeStatus] : undefined;

    const { data } = await apiClient.get<ListDisputesResponse>('/admin/disputes', {
      params: { page, limit: pageSize, ...(serviceStatus ? { status: serviceStatus } : {}) },
    });

    const body = data.data;
    return {
      success: true,
      data: {
        items: (body.disputes ?? []).map(toPanelDispute),
        total: body.total ?? 0,
        page: body.page ?? page,
        pageSize: body.limit ?? pageSize,
        totalPages: body.totalPages ?? 1,
      },
    };
  },

  getById: async (id: string): Promise<ApiEnvelope<Dispute>> => {
    // Buyer/seller-scoped route, but an admin identity passes its ownership
    // check, so it doubles as the admin detail fetch.
    const { data } = await apiClient.get<{ success: boolean; data: ServiceDispute }>(
      `/disputes/${id}`,
    );
    return { success: true, data: toPanelDispute(data.data) };
  },

  /**
   * Admin arbitration. `resolution` must name who won — the service rejects
   * anything other than RESOLVED_BUYER_FAVOR / RESOLVED_SELLER_FAVOR with a 400.
   */
  resolve: async (
    id: string,
    resolution: { inFavorOf: 'buyer' | 'seller'; note?: string },
  ): Promise<ApiEnvelope<void>> => {
    await apiClient.patch(`/admin/disputes/${id}/resolve`, {
      resolution:
        resolution.inFavorOf === 'buyer' ? 'RESOLVED_BUYER_FAVOR' : 'RESOLVED_SELLER_FAVOR',
      ...(resolution.note ? { note: resolution.note } : {}),
    });
    return { success: true, data: undefined as void };
  },

  assignToAgent: (_id: string, _agentId: string): Promise<ApiEnvelope<void>> =>
    unsupported(
      'Assigning a dispute to an agent',
      'dispute-service has no assignment concept; any admin can resolve any dispute.',
    ),

  close: (_id: string): Promise<ApiEnvelope<void>> =>
    unsupported(
      'Closing a dispute',
      'resolving it IS the terminal action — use resolve(id, { inFavorOf }).',
    ),
};
