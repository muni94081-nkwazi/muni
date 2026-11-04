import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { AdClick, Campaign } from '../models/advertising.model.js';
import type { CampaignUpdate, IAdvertisingRepository } from '../types/repositories.js';

// ─── Prisma-backed advertising repository ─────────────────────────────────────

type CampaignRow = Prisma.CampaignGetPayload<Record<string, never>>;
type ClickRow = Prisma.AdClickGetPayload<Record<string, never>>;

const campaignToDomain = (row: CampaignRow): Campaign => ({
  id: row.id,
  sellerId: row.sellerId,
  productId: row.productId,
  productName: row.productName,
  campaignName: row.campaignName,
  dailyBudgetUGX: row.dailyBudgetUGX.toNumber(),
  bidPerClickUGX: row.bidPerClickUGX.toNumber(),
  keywords: row.keywords,
  status: row.status,
  totalImpressions: row.totalImpressions,
  totalClicks: row.totalClicks,
  totalSpentUGX: row.totalSpentUGX.toNumber(),
  startDate: row.startDate,
  endDate: row.endDate ?? undefined,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const clickToDomain = (row: ClickRow): AdClick => ({
  id: row.id,
  campaignId: row.campaignId,
  productId: row.productId,
  sellerId: row.sellerId,
  chargedAmountUGX: row.chargedAmountUGX.toNumber(),
  userIp: row.userIp ?? undefined,
  clickedAt: row.clickedAt.toISOString(),
});

function isMissingRecord(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export class PrismaAdvertisingRepository implements IAdvertisingRepository {
  async createCampaign(c: Campaign): Promise<Campaign> {
    const row = await prisma.campaign.create({
      data: {
        id: c.id,
        sellerId: c.sellerId,
        productId: c.productId,
        productName: c.productName,
        campaignName: c.campaignName,
        dailyBudgetUGX: c.dailyBudgetUGX,
        bidPerClickUGX: c.bidPerClickUGX,
        keywords: c.keywords,
        status: c.status,
        totalImpressions: c.totalImpressions,
        totalClicks: c.totalClicks,
        totalSpentUGX: c.totalSpentUGX,
        startDate: c.startDate,
        endDate: c.endDate ?? null,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      },
    });
    return campaignToDomain(row);
  }

  async findCampaignById(id: string): Promise<Campaign | null> {
    const row = await prisma.campaign.findUnique({ where: { id } });
    return row ? campaignToDomain(row) : null;
  }

  async findCampaignsBySeller(sellerId: string): Promise<Campaign[]> {
    const rows = await prisma.campaign.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(campaignToDomain);
  }

  async findServableCampaigns(): Promise<Campaign[]> {
    // Postgres cannot compare two columns through Prisma's filter syntax, so
    // the budget check happens in JS. The status filter still does the heavy
    // narrowing via the index.
    const rows = await prisma.campaign.findMany({ where: { status: 'ACTIVE' } });
    return rows
      .map(campaignToDomain)
      .filter((c) => c.totalSpentUGX < c.dailyBudgetUGX);
  }

  async updateCampaign(id: string, patch: CampaignUpdate, updatedAt: string): Promise<Campaign | null> {
    const data: Prisma.CampaignUpdateInput = { updatedAt: new Date(updatedAt) };
    if (patch.campaignName !== undefined) data.campaignName = patch.campaignName;
    if (patch.dailyBudgetUGX !== undefined) data.dailyBudgetUGX = patch.dailyBudgetUGX;
    if (patch.bidPerClickUGX !== undefined) data.bidPerClickUGX = patch.bidPerClickUGX;
    if (patch.keywords !== undefined) data.keywords = patch.keywords;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.endDate !== undefined) data.endDate = patch.endDate;

    try {
      const row = await prisma.campaign.update({ where: { id }, data });
      return campaignToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async incrementImpressions(campaignIds: string[]): Promise<void> {
    if (campaignIds.length === 0) return;
    await prisma.campaign.updateMany({
      where: { id: { in: campaignIds } },
      data: { totalImpressions: { increment: 1 } },
    });
  }

  async chargeClick(campaignId: string, updatedAt: string): Promise<Campaign | null> {
    // Raw SQL because the charge and the budget check have to reference each
    // other's columns in one statement. Prisma's filter syntax cannot express
    // `total_spent_ugx + bid_per_click_ugx <= daily_budget_ugx`, and doing it
    // as read-then-write is exactly the race that lets two simultaneous clicks
    // both pass the check and overspend the seller's daily budget.
    const updated = await prisma.$executeRaw`
      UPDATE "campaigns"
      SET    total_clicks     = total_clicks + 1,
             total_spent_ugx  = total_spent_ugx + bid_per_click_ugx,
             updated_at       = ${new Date(updatedAt)}
      WHERE  id = ${campaignId}
        AND  status = 'ACTIVE'
        AND  total_spent_ugx + bid_per_click_ugx <= daily_budget_ugx
    `;

    if (updated === 0) return null;

    return this.findCampaignById(campaignId);
  }

  async markBudgetExhausted(campaignId: string, updatedAt: string): Promise<Campaign | null> {
    try {
      const row = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'BUDGET_EXHAUSTED', updatedAt: new Date(updatedAt) },
      });
      return campaignToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async recordClick(click: AdClick): Promise<AdClick> {
    const row = await prisma.adClick.create({
      data: {
        id: click.id,
        campaignId: click.campaignId,
        productId: click.productId,
        sellerId: click.sellerId,
        chargedAmountUGX: click.chargedAmountUGX,
        userIp: click.userIp ?? null,
        clickedAt: new Date(click.clickedAt),
      },
    });
    return clickToDomain(row);
  }

  async findClicks(campaignId: string): Promise<AdClick[]> {
    const rows = await prisma.adClick.findMany({
      where: { campaignId },
      orderBy: { clickedAt: 'asc' },
    });
    return rows.map(clickToDomain);
  }
}

export const prismaAdvertisingRepository = new PrismaAdvertisingRepository();
