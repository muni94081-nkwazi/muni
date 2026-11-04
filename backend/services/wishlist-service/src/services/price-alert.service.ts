import { randomUUID } from 'node:crypto';
import type { PriceTracking, PriceHistoryPoint } from '../models/wishlist.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { prismaPriceAlertRepository } from '../repositories/prisma-wishlist.repository.js';
import type { IPriceAlertRepository } from '../types/repositories.js';

// ─── Price alert service ──────────────────────────────────────────────────────
//
// Alerts live in Postgres behind IPriceAlertRepository. They were a Map, so a
// restart silently cancelled every alert a customer had set — a promise to
// tell them when something got cheaper, quietly dropped.
//
// The `phone-001` price history that used to be seeded here is gone: it was
// fabricated chart data for one hardcoded product, and writing it into a real
// database would put invented prices on a real product page.

let intervalId: NodeJS.Timeout | null = null;

export class PriceAlertService {
  constructor(private readonly repo: IPriceAlertRepository = prismaPriceAlertRepository) {}

  async setPriceAlert(
    userId: string,
    productId: string,
    productName: string,
    targetPrice: number,
    currentPrice = 4200000,
  ): Promise<PriceTracking> {
    const ts = new Date().toISOString();

    return this.repo.createAlert({
      id: randomUUID(),
      userId,
      productId,
      productName,
      targetPrice,
      currency: 'UGX',
      currentPrice,
      lastCheckedAt: ts,
      isActive: true,
      createdAt: ts,
    });
  }

  async listUserAlerts(userId: string): Promise<PriceTracking[]> {
    return this.repo.findActiveAlertsByUser(userId);
  }

  async deleteAlert(id: string): Promise<boolean> {
    return this.repo.deleteAlert(id);
  }

  async updateAlert(id: string, targetPrice: number): Promise<PriceTracking | null> {
    return this.repo.updateAlert(id, targetPrice, new Date().toISOString());
  }

  async getPriceHistory(productId: string): Promise<PriceHistoryPoint[]> {
    // Returns an empty series for a product with no recorded history. The old
    // code invented a single 100,000 UGX point instead, which drew a flat line
    // on the chart that looked like real data.
    return this.repo.findPriceHistory(productId);
  }

  /** Background Job: Every 6 Hours Price Drop Checker */
  startPriceDropCheckerJob(): void {
    console.log('[wishlist-service] 🔄 Starting 6-hour price drop checker background job...');
    void this.checkPriceDrops();

    intervalId = setInterval(() => {
      void this.checkPriceDrops();
    }, 6 * 60 * 60 * 1000);
  }

  stopPriceDropCheckerJob(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  async checkPriceDrops(): Promise<void> {
    const activeAlerts = await this.repo.findAllActiveAlerts();

    for (const alert of activeAlerts) {
      if (alert.currentPrice <= alert.targetPrice) {
        void publish('notification-events' as never, {
          type: 'alert.price_drop',
          data: {
            userId: alert.userId,
            productId: alert.productId,
            productName: alert.productName,
            oldPrice: alert.targetPrice * 1.15,
            newPrice: alert.currentPrice,
            currency: alert.currency,
          },
        });
      }
    }
  }
}

export const priceAlertService = new PriceAlertService();
