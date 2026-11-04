import { apiClient } from './axios.config';
import type { Campaign, CampaignStatus } from '@/types/advertising.types';

// ─── Backing service, and where the two models disagree ───────────────────────
//
// advertising-service serves /api/v1/advertising/campaigns (GET, POST) and
// /api/v1/advertising/campaigns/:id (GET, PATCH). Note the path: the gateway
// mounts advertising with `pub('/advertising', targets.advertising)` in
// customer.routes.ts — there is NO /seller/advertising route, so that prefix
// would 404. Seller scoping happens inside the service, which reads the
// gateway-stamped x-user-id and lists only that seller's campaigns.
//
// The two Campaign models are not the same shape:
//
//   backend   one product per campaign, a flat string[] of keywords, and
//             three lifetime counters (impressions, clicks, spend).
//   frontend  nested shape — adGroups[] each holding productIds and
//             per-keyword bids/metrics, plus acos/roas/sales and a daily
//             history series.
//
// So the mapping below is lossy in one direction and synthetic in the other:
// a backend campaign becomes a single ad group with one product. Fields the
// service does not track at all — sales, ACOS, ROAS, per-keyword metrics and
// the history series — come back as zeros/empty rather than as invented
// numbers, which is what the fixture supplied.

type ServiceStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'BUDGET_EXHAUSTED';

interface ServiceCampaign {
  id: string;
  sellerId: string;
  productId: string;
  productName: string;
  campaignName: string;
  dailyBudgetUGX: number;
  bidPerClickUGX: number;
  keywords: string[];
  status: ServiceStatus;
  totalImpressions: number;
  totalClicks: number;
  totalSpentUGX: number;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_IN: Record<ServiceStatus, CampaignStatus> = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  EXPIRED: 'ended',
  // Budget exhausted is not "ended" — it resumes when the budget resets — but
  // the panel has no state for it, and 'paused' is the honest approximation.
  BUDGET_EXHAUSTED: 'paused',
};

const STATUS_OUT: Partial<Record<CampaignStatus, ServiceStatus>> = {
  active: 'ACTIVE',
  paused: 'PAUSED',
  ended: 'EXPIRED',
  // 'draft' has no backend equivalent — the service creates campaigns live.
};

function toCampaign(c: ServiceCampaign): Campaign {
  const clicks = c.totalClicks ?? 0;
  const impressions = c.totalImpressions ?? 0;

  return {
    id: c.id,
    name: c.campaignName,
    status: STATUS_IN[c.status] ?? 'paused',
    dailyBudget: c.dailyBudgetUGX,
    startDate: c.startDate,
    endDate: c.endDate,
    // One synthetic group: the service models a campaign as one product.
    adGroups: [
      {
        id: `${c.id}-default`,
        name: c.productName,
        productIds: [c.productId],
        keywords: (c.keywords ?? []).map((text, i) => ({
          id: `${c.id}-kw-${i}`,
          text,
          matchType: 'broad',
          bid: c.bidPerClickUGX,
          // Per-keyword attribution is not tracked; only campaign totals are.
          impressions: 0,
          clicks: 0,
          spend: 0,
          sales: 0,
        })),
      },
    ],
    metrics: {
      impressions,
      clicks,
      spend: c.totalSpentUGX ?? 0,
      // No conversion tracking in advertising-service — there is no join back
      // to orders — so these stay zero rather than being fabricated.
      sales: 0,
      acos: 0,
      roas: 0,
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    },
    history: [],
  };
}

export const advertisingApi = {
  async listCampaigns(): Promise<Campaign[]> {
    const { data } = await apiClient.get<{ success: boolean; data: ServiceCampaign[] }>(
      '/advertising/campaigns',
    );
    return (data.data ?? []).map(toCampaign);
  },

  /**
   * The service requires productId, productName, dailyBudgetUGX and
   * bidPerClickUGX, and 400s without them. They are pulled off the first ad
   * group, since that is the only one a backend campaign can represent — a
   * multi-group campaign built in the UI cannot be sent as-is.
   */
  async createCampaign(campaign: Omit<Campaign, 'id'> & { id?: string }): Promise<Campaign> {
    const group = campaign.adGroups?.[0];
    const productId = group?.productIds?.[0];

    if (!productId) {
      throw new Error('Add at least one product to the ad group before launching the campaign.');
    }
    if ((campaign.adGroups?.length ?? 0) > 1) {
      console.warn(
        '[advertising] advertising-service stores one product per campaign — only the first ' +
        'ad group is sent. Create separate campaigns for the rest.',
      );
    }

    const { data } = await apiClient.post<{ success: boolean; data: ServiceCampaign }>(
      '/advertising/campaigns',
      {
        productId,
        productName: group?.name || campaign.name,
        campaignName: campaign.name,
        dailyBudgetUGX: campaign.dailyBudget,
        // Per-keyword bids collapse to one campaign bid; take the first.
        bidPerClickUGX: group?.keywords?.[0]?.bid ?? campaign.dailyBudget,
        keywords: (group?.keywords ?? []).map((k) => k.text),
      },
    );
    return toCampaign(data.data);
  },

  async updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.campaignName = patch.name;
    if (patch.dailyBudget !== undefined) body.dailyBudgetUGX = patch.dailyBudget;
    if (patch.endDate !== undefined) body.endDate = patch.endDate;
    if (patch.status !== undefined) {
      const mapped = STATUS_OUT[patch.status];
      if (!mapped) {
        throw new Error(`Status "${patch.status}" has no equivalent in advertising-service.`);
      }
      body.status = mapped;
    }

    const { data } = await apiClient.patch<{ success: boolean; data: ServiceCampaign }>(
      `/advertising/campaigns/${id}`,
      body,
    );
    return toCampaign(data.data);
  },
};
