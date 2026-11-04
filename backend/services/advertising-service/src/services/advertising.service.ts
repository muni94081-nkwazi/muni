import { randomUUID } from 'node:crypto';
import type {
  Campaign,
  AdClick,
  SponsoredProduct,
  CampaignAnalytics,
} from '../models/advertising.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { prismaAdvertisingRepository } from '../repositories/prisma-advertising.repository.js';
import type { CampaignUpdate, IAdvertisingRepository } from '../types/repositories.js';

// ─── Advertising service ──────────────────────────────────────────────────────
//
// Campaigns and the click log live in Postgres behind IAdvertisingRepository.
// This is seller money: every click charges the campaign's bid against a daily
// budget. The Map meant a restart reset totalSpentUGX, so budgets that had
// already been exhausted started spending again, and the click log backing
// those charges was gone.
//
// The seeded `ad-camp-seed-1` campaign is gone with it — it carried 84 clicks
// and 42,000 UGX of invented spend against a real seller id.

export class AdvertisingService {
  constructor(private readonly repo: IAdvertisingRepository = prismaAdvertisingRepository) {}

  async createCampaign(input: {
    sellerId: string;
    productId: string;
    productName: string;
    campaignName: string;
    dailyBudgetUGX: number;
    bidPerClickUGX: number;
    keywords: string[];
  }): Promise<Campaign> {
    const ts = new Date().toISOString();

    const campaign = await this.repo.createCampaign({
      id: randomUUID(),
      sellerId: input.sellerId,
      productId: input.productId,
      productName: input.productName,
      campaignName: input.campaignName,
      dailyBudgetUGX: input.dailyBudgetUGX,
      bidPerClickUGX: input.bidPerClickUGX,
      keywords: input.keywords.map((k) => k.toLowerCase().trim()),
      status: 'ACTIVE',
      totalImpressions: 0,
      totalClicks: 0,
      totalSpentUGX: 0,
      startDate: ts,
      createdAt: ts,
      updatedAt: ts,
    });

    void publish('advertising-events' as never, { type: 'campaign.created', data: campaign });

    return campaign;
  }

  async getCampaigns(sellerId: string): Promise<Campaign[]> {
    return this.repo.findCampaignsBySeller(sellerId);
  }

  async getCampaignById(id: string): Promise<Campaign | null> {
    return this.repo.findCampaignById(id);
  }

  async updateCampaign(id: string, updates: CampaignUpdate): Promise<Campaign | null> {
    return this.repo.updateCampaign(id, updates, new Date().toISOString());
  }

  async getSponsoredProducts(queryKeyword?: string): Promise<SponsoredProduct[]> {
    const keyword = (queryKeyword || '').toLowerCase().trim();
    const servable = await this.repo.findServableCampaigns();

    // Every servable campaign counts an impression, matched or not — that is
    // what the original did, and CTR is computed against it.
    await this.repo.incrementImpressions(servable.map((c) => c.id));

    const matches: SponsoredProduct[] = [];

    for (const c of servable) {
      const matchesKeyword =
        !keyword || c.keywords.some((k) => k.includes(keyword) || keyword.includes(k));

      if (matchesKeyword) {
        matches.push({
          campaignId: c.id,
          productId: c.productId,
          productName: c.productName,
          sellerId: c.sellerId,
          bidPerClickUGX: c.bidPerClickUGX,
          isSponsoredBadge: true,
          matchScore: c.bidPerClickUGX * (keyword ? 1.5 : 1.0),
        });
      }
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  async recordClick(campaignId: string, userIp?: string): Promise<AdClick | null> {
    const campaign = await this.repo.findCampaignById(campaignId);
    if (!campaign) return null;

    const ts = new Date().toISOString();

    // The charge is a single conditional UPDATE. The old code read the spend,
    // compared it to the budget and then incremented, so two clicks landing
    // together could both pass the check and bill the seller past their daily
    // cap. Null means the budget can no longer cover the bid.
    const charged = await this.repo.chargeClick(campaignId, ts);
    if (!charged) {
      await this.repo.markBudgetExhausted(campaignId, ts);
      return null;
    }

    const click = await this.repo.recordClick({
      id: randomUUID(),
      campaignId,
      productId: charged.productId,
      sellerId: charged.sellerId,
      // The bid at the moment of the click, so a later bid change cannot
      // rewrite what was already billed.
      chargedAmountUGX: charged.bidPerClickUGX,
      userIp,
      clickedAt: ts,
    });

    // Exhausted by this very click — flip it now rather than waiting for the
    // next one to be rejected.
    if (charged.totalSpentUGX + charged.bidPerClickUGX > charged.dailyBudgetUGX) {
      await this.repo.markBudgetExhausted(campaignId, ts);
    }

    void publish('advertising-events' as never, { type: 'ad.clicked', data: click });

    return click;
  }

  async getClicks(campaignId: string): Promise<AdClick[]> {
    return this.repo.findClicks(campaignId);
  }

  async getAnalytics(sellerId: string): Promise<CampaignAnalytics> {
    const userCampaigns = await this.repo.findCampaignsBySeller(sellerId);

    const totalCampaigns = userCampaigns.length;
    const activeCampaigns = userCampaigns.filter((c) => c.status === 'ACTIVE').length;
    const totalImpressions = userCampaigns.reduce((sum, c) => sum + c.totalImpressions, 0);
    const totalClicks = userCampaigns.reduce((sum, c) => sum + c.totalClicks, 0);
    const totalSpendUGX = userCampaigns.reduce((sum, c) => sum + c.totalSpentUGX, 0);

    const averageCTRPercent =
      totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0;
    const averageCPCUGX = totalClicks > 0 ? Math.round(totalSpendUGX / totalClicks) : 0;

    return {
      totalCampaigns,
      activeCampaigns,
      totalImpressions,
      totalClicks,
      averageCTRPercent,
      totalSpendUGX,
      averageCPCUGX,
    };
  }
}

export const advertisingService = new AdvertisingService();
