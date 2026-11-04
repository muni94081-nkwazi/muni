import type { AdClick, Campaign } from '../models/advertising.model.js';
import type { CampaignUpdate, IAdvertisingRepository } from '../types/repositories.js';

// ─── In-memory advertising repository ─────────────────────────────────────────
//
// For tests, and for running without a database. Starts empty — the seeded
// `ad-camp-seed-1` campaign carried 84 clicks and 42,000 UGX of spend against
// a real seller id, and writing invented ad charges into a database is not
// something to do by default.

export class MemoryAdvertisingRepository implements IAdvertisingRepository {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly clicks: AdClick[] = [];

  clear(): void {
    this.campaigns.clear();
    this.clicks.length = 0;
  }

  seed(campaign: Campaign): void {
    this.campaigns.set(campaign.id, structuredClone(campaign));
  }

  async createCampaign(c: Campaign): Promise<Campaign> {
    this.campaigns.set(c.id, structuredClone(c));
    return structuredClone(c);
  }

  async findCampaignById(id: string): Promise<Campaign | null> {
    const found = this.campaigns.get(id);
    return found ? structuredClone(found) : null;
  }

  async findCampaignsBySeller(sellerId: string): Promise<Campaign[]> {
    return [...this.campaigns.values()]
      .filter((c) => c.sellerId === sellerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => structuredClone(c));
  }

  async findServableCampaigns(): Promise<Campaign[]> {
    return [...this.campaigns.values()]
      .filter((c) => c.status === 'ACTIVE' && c.totalSpentUGX < c.dailyBudgetUGX)
      .map((c) => structuredClone(c));
  }

  async updateCampaign(id: string, patch: CampaignUpdate, updatedAt: string): Promise<Campaign | null> {
    const current = this.campaigns.get(id);
    if (!current) return null;

    for (const key of Object.keys(patch) as (keyof CampaignUpdate)[]) {
      const value = patch[key];
      if (value !== undefined) Object.assign(current, { [key]: value });
    }
    current.updatedAt = updatedAt;

    return structuredClone(current);
  }

  async incrementImpressions(campaignIds: string[]): Promise<void> {
    for (const id of campaignIds) {
      const campaign = this.campaigns.get(id);
      if (campaign) campaign.totalImpressions += 1;
    }
  }

  async chargeClick(campaignId: string, updatedAt: string): Promise<Campaign | null> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return null;

    // Same predicate as the conditional UPDATE: the charge must fit inside
    // what is left of the daily budget.
    if (campaign.status !== 'ACTIVE') return null;
    if (campaign.totalSpentUGX + campaign.bidPerClickUGX > campaign.dailyBudgetUGX) return null;

    campaign.totalClicks += 1;
    campaign.totalSpentUGX += campaign.bidPerClickUGX;
    campaign.updatedAt = updatedAt;

    return structuredClone(campaign);
  }

  async markBudgetExhausted(campaignId: string, updatedAt: string): Promise<Campaign | null> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return null;

    campaign.status = 'BUDGET_EXHAUSTED';
    campaign.updatedAt = updatedAt;

    return structuredClone(campaign);
  }

  async recordClick(click: AdClick): Promise<AdClick> {
    this.clicks.push(structuredClone(click));
    return structuredClone(click);
  }

  async findClicks(campaignId: string): Promise<AdClick[]> {
    return this.clicks
      .filter((c) => c.campaignId === campaignId)
      .sort((a, b) => a.clickedAt.localeCompare(b.clickedAt))
      .map((c) => structuredClone(c));
  }
}
