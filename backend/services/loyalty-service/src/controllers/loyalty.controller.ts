import type { Request, Response } from 'express';
import { loyaltyService } from '../services/loyalty.service.js';

/**
 * The authenticated caller, and the only accepted source of identity.
 *
 * Every handler below used to resolve the user as
 *   req.headers['x-user-id'] || req.body.userId || 'user-123'
 * which let any caller act as any user simply by naming them in the request
 * body, and made an unauthenticated request act as a fixed fake user. The
 * gateway strips the header, but it cannot strip a request body.
 *
 * requireAuth verifies the gateway's signed identity assertion and puts the
 * result in res.locals.userId, so that is what these handlers read. The routes
 * that use this helper are all mounted behind requireAuth (see app.ts), so the
 * value is always present; the throw is a guard against a future route being
 * added without the middleware rather than an expected path.
 */
function actingUser(res: Response): string {
  const userId = res.locals.userId as string | undefined;
  if (!userId) throw new Error('actingUser called on a route that is not behind requireAuth');
  return userId;
}

export async function getUserPoints(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const user = await loyaltyService.getOrCreateUser(userId);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const history = await loyaltyService.getHistory(userId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getRewards(_req: Request, res: Response): Promise<void> {
  try {
    const rewards = await loyaltyService.getAvailableRewards();
    res.json({ success: true, data: rewards });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function redeemReward(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  const { rewardId } = req.body;

  if (!rewardId) {
    res.status(400).json({ success: false, message: 'rewardId is required' });
    return;
  }

  try {
    const redemption = await loyaltyService.redeemReward(userId, rewardId);
    res.json({ success: true, data: redemption });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

export async function generateReferral(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const ref = await loyaltyService.generateReferral(userId);
    res.json({ success: true, data: ref });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getTierBenefits(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: [
      { tier: 'BRONZE', minPoints: 0, bonusRate: '0%', benefits: ['Earn 1 pt per 1,000 UGX'] },
      { tier: 'SILVER', minPoints: 1000, bonusRate: '5%', benefits: ['5% Bonus Points', 'Birthday Reward'] },
      { tier: 'GOLD', minPoints: 5000, bonusRate: '10%', benefits: ['10% Bonus Points', 'Free Delivery Vouchers', 'Priority Support'] },
      { tier: 'PLATINUM', minPoints: 10000, bonusRate: '15%', benefits: ['15% Bonus Points', 'Unlimited Free Delivery', 'Early Access Sales'] },
    ],
  });
}

export async function claimBirthday(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const user = await loyaltyService.claimBirthdayBonus(userId);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
