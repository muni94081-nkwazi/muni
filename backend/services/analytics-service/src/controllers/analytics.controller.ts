import type { Request, Response } from 'express';
import { sellerAnalyticsService } from '../services/seller-analytics.service.js';
import { adminAnalyticsService } from '../services/admin-analytics.service.js';
import { cache } from '../../../../shared/cache/redis.js';
import type { TimePeriod } from '../models/analytics.model.js';

const FIVE_MINUTES = 5 * 60; // 300 seconds TTL

/** Roles that legitimately read any seller's numbers. */
const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'];

function isStaff(res: Response): boolean {
  const roles = (res.locals.roles as string[]) ?? [];
  return Boolean(res.locals.callingService) || roles.some((r) => STAFF_ROLES.includes(r));
}

/**
 * One seller's dashboard — revenue, orders, best sellers, conversion.
 *
 * The seller was taken from the URL: `req.params.id` first, then an unverified
 * header, then a literal 'seller-001'. So any seller could read any other
 * seller's entire commercial performance by editing the path, and with no
 * identity at all the endpoint answered as a real seller id.
 *
 * Ownership now comes from the verified identity. Sellers are known parties on
 * the marketplace rather than ids to enumerate, and the caller typed the path
 * themselves, so this is a plain 403 rather than the 404 used where an id could
 * be probed.
 */
export async function getSellerDashboard(req: Request, res: Response): Promise<void> {
  const callerId = res.locals.userId as string;
  const requested = req.params.id || req.params.vendorId;

  if (requested && requested !== callerId && !isStaff(res)) {
    res.status(403).json({ success: false, message: 'You can only view your own analytics.' });
    return;
  }

  const sellerId = requested || callerId;
  const period = (req.query.period as TimePeriod) || 'month';
  const cacheKey = `analytics:seller:${sellerId}:${period}`;

  try {
    const data = await cache.getOrSet(
      cacheKey,
      FIVE_MINUTES,
      () => sellerAnalyticsService.getSellerDashboard(sellerId, period)
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getAdminDashboard(req: Request, res: Response): Promise<void> {
  const period = (req.query.period as TimePeriod) || 'month';
  const cacheKey = `analytics:admin:${period}`;

  try {
    const data = await cache.getOrSet(
      cacheKey,
      FIVE_MINUTES,
      () => adminAnalyticsService.getAdminDashboard(period)
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
