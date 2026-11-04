import type { AdClick, Campaign } from '../models/advertising.model.js';

// ─── Repository contract ──────────────────────────────────────────────────────

export type CampaignUpdate = Partial<
  Pick<
    Campaign,
    'campaignName' | 'dailyBudgetUGX' | 'bidPerClickUGX' | 'keywords' | 'status' | 'endDate'
  >
>;

export interface IAdvertisingRepository {
  createCampaign(campaign: Campaign): Promise<Campaign>;
  findCampaignById(id: string): Promise<Campaign | null>;
  findCampaignsBySeller(sellerId: string): Promise<Campaign[]>;

  /** ACTIVE campaigns that have not yet spent their daily budget. */
  findServableCampaigns(): Promise<Campaign[]>;

  updateCampaign(id: string, patch: CampaignUpdate, updatedAt: string): Promise<Campaign | null>;

  /** Bump the impression counters for a set of campaigns in one statement. */
  incrementImpressions(campaignIds: string[]): Promise<void>;

  /**
   * Charge one click against a campaign's budget, atomically.
   *
   * The predicate `totalSpentUGX + bid <= dailyBudgetUGX` is evaluated under
   * the row lock the write itself takes, so two clicks arriving together
   * cannot both pass a budget check and overspend the seller. Returns null
   * when the budget can no longer cover the bid.
   */
  chargeClick(campaignId: string, updatedAt: string): Promise<Campaign | null>;

  /** Mark a campaign as out of budget. */
  markBudgetExhausted(campaignId: string, updatedAt: string): Promise<Campaign | null>;

  recordClick(click: AdClick): Promise<AdClick>;
  findClicks(campaignId: string): Promise<AdClick[]>;
}
