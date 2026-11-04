import type { Request, Response } from 'express';
import { advertisingService } from '../services/advertising.service.js';

// ─── Advertising controller ───────────────────────────────────────────────────
//
// Identity comes from `res.locals`, where the shared auth middleware puts it
// after verifying the gateway's signed assertion (see app.ts). Every handler
// here used to resolve the seller as:
//
//   (req.headers['x-user-id'] as string) || req.body.sellerId || 'seller-001'
//
// — an unverified header, then the caller's own request body, then a literal
// seller id. No route had any authentication, and the gateway published the
// whole /advertising prefix with pub(), so this was reachable unauthenticated
// from the internet. Campaigns spend real money: a click charges the campaign's
// bid against its daily budget.
//
// What that allowed: opening a campaign billed to any seller, reading any
// seller's campaigns and ad performance through `?sellerId=`, and — because
// neither the single-campaign read nor the update checked ownership — editing a
// competitor's budget, bid or keywords by campaign id.

/** Roles that legitimately act across every seller's advertising. */
const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'];

function callerId(res: Response): string {
  return res.locals.userId as string;
}

function isStaff(res: Response): boolean {
  const roles = (res.locals.roles as string[]) ?? [];
  return Boolean(res.locals.callingService) || roles.some((r) => STAFF_ROLES.includes(r));
}

/**
 * Whose advertising this request is about.
 *
 * The caller's own, unless they are staff and named someone — which is what an
 * ops console reviewing a seller's ad spend needs. `?sellerId=` from anyone else
 * is ignored rather than rejected, so a stale bookmark narrows to the caller's
 * own data instead of erroring.
 */
function scopedSellerId(req: Request, res: Response): string {
  const requested = req.query.sellerId as string | undefined;
  return isStaff(res) && requested ? requested : callerId(res);
}

/** A campaign the caller may not touch answers exactly like one that does not exist. */
function notFound(res: Response): void {
  res.status(404).json({ success: false, message: 'Campaign not found' });
}

export async function createCampaign(req: Request, res: Response): Promise<void> {
  // A seller may only open a campaign against themselves; staff may open one
  // for any seller, which is what an ops-side booking needs. `sellerId` in the
  // body was previously believed from anyone.
  const sellerId = isStaff(res) && req.body.sellerId ? String(req.body.sellerId) : callerId(res);
  const { productId, productName, campaignName, dailyBudgetUGX, bidPerClickUGX, keywords } = req.body;

  if (!productId || !productName || !dailyBudgetUGX || !bidPerClickUGX) {
    res.status(400).json({ success: false, message: 'productId, productName, dailyBudgetUGX, and bidPerClickUGX are required' });
    return;
  }

  try {
    const campaign = await advertisingService.createCampaign({
      sellerId,
      productId,
      productName,
      campaignName: campaignName || `${productName} Ad Campaign`,
      dailyBudgetUGX: Number(dailyBudgetUGX),
      bidPerClickUGX: Number(bidPerClickUGX),
      keywords: Array.isArray(keywords) ? keywords : ['sponsored'],
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getCampaigns(req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await advertisingService.getCampaigns(scopedSellerId(req, res));
    res.json({ success: true, data: campaigns });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getCampaignById(req: Request, res: Response): Promise<void> {
  try {
    const campaign = await advertisingService.getCampaignById(req.params.id);
    // Ownership, not just existence. This returned any campaign to anyone who
    // had its id — a competitor's bid per click, daily budget, keyword list and
    // spend to date, which is their entire ad strategy.
    if (!campaign || !(isStaff(res) || campaign.sellerId === callerId(res))) {
      return notFound(res);
    }
    res.json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function updateCampaign(req: Request, res: Response): Promise<void> {
  try {
    // Read before write: the update is addressed by id alone, so without this
    // any caller could retune a competitor's campaign — drop their bid to lose
    // every auction, or raise their daily budget to drain it.
    const existing = await advertisingService.getCampaignById(req.params.id);
    if (!existing || !(isStaff(res) || existing.sellerId === callerId(res))) {
      return notFound(res);
    }

    const campaign = await advertisingService.updateCampaign(req.params.id, req.body);
    if (!campaign) return notFound(res);

    res.json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getSponsoredProducts(req: Request, res: Response): Promise<void> {
  const keyword = (req.query.keyword as string) || (req.query.q as string);
  try {
    const products = await advertisingService.getSponsoredProducts(keyword);
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function recordClick(req: Request, res: Response): Promise<void> {
  const { campaignId } = req.body;
  if (!campaignId) {
    res.status(400).json({ success: false, message: 'campaignId is required' });
    return;
  }

  try {
    const click = await advertisingService.recordClick(campaignId, req.ip);
    if (!click) {
      res.status(400).json({ success: false, message: 'Campaign inactive or daily budget exhausted' });
      return;
    }
    res.json({ success: true, data: click });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const analytics = await advertisingService.getAnalytics(scopedSellerId(req, res));
    res.json({ success: true, data: analytics });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
