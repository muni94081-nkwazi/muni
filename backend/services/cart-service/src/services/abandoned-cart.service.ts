import { randomUUID } from 'node:crypto';
import type { AbandonedCart } from '../models/cart.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { abandonedCartRepository } from '../repositories/abandoned-cart.repository.js';
import type { IAbandonedCartRepository } from '../repositories/abandoned-cart.repository.js';

const SIXTY_MINUTES_MS = 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

export class AbandonedCartService {
  constructor(private readonly repo: IAbandonedCartRepository = abandonedCartRepository) {}

  /** Admin Dashboard: Get all abandoned carts */
  async getAbandonedCarts(): Promise<AbandonedCart[]> {
    const carts = await this.repo.getAll();
    return carts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Who an abandoned basket belongs to, or null if there is no such basket.
   *
   * Separate from `restoreCart` so ownership can be settled BEFORE anything is
   * written: restoring marks the cart recovered and records a recovery attempt,
   * and a caller who may not have it should not be able to cause either.
   */
  async getCartOwner(cartId: string): Promise<string | null> {
    const cart = await this.repo.getById(cartId);
    return cart?.userId ?? null;
  }

  /** Restore abandoned cart */
  async restoreCart(cartId: string): Promise<AbandonedCart | null> {
    const cart = await this.repo.getById(cartId);
    if (!cart) return null;

    cart.status = 'recovered';
    cart.lastActivityAt = new Date().toISOString();
    await this.repo.save(cart);

    await this.repo.addRecoveryAttempt({
      id: randomUUID(),
      cartId,
      userId: cart.userId,
      channel: 'email',
      attemptedAt: new Date().toISOString(),
      success: true,
    });

    return cart;
  }

  /** Analytics: Get recovery rate statistics */
  async getRecoveryStats(): Promise<{
    totalAbandoned: number;
    totalRecovered: number;
    recoveryRatePercent: number;
    recoveredRevenueUGX: number;
  }> {
    const carts = await this.repo.getAll();
    const totalAbandoned = carts.length;
    const recovered = carts.filter((c) => c.status === 'recovered');
    const totalRecovered = recovered.length;
    const recoveryRatePercent = totalAbandoned > 0 ? Math.round((totalRecovered / totalAbandoned) * 1000) / 10 : 0;
    const recoveredRevenueUGX = recovered.reduce((sum, c) => sum + c.total, 0);

    return {
      totalAbandoned,
      totalRecovered,
      recoveryRatePercent,
      recoveredRevenueUGX,
    };
  }

  /** Hourly Inactive Cart Scanner Background Job */
  startAbandonedCartScannerJob(): void {
    console.log('[cart-service] 🔄 Starting hourly abandoned cart scanner background job...');
    void this.scanAbandonedCarts();

    intervalId = setInterval(() => {
      void this.scanAbandonedCarts();
    }, SIXTY_MINUTES_MS);
  }

  stopAbandonedCartScannerJob(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  async scanAbandonedCarts(): Promise<void> {
    const cutoffMs = Date.now() - SIXTY_MINUTES_MS;
    const inactiveCarts = await this.repo.findInactiveSince(cutoffMs);

    for (const cart of inactiveCarts) {
      if (cart.status !== 'abandoned') continue;

      void publish('cart-events' as any, {
        type: 'cart.abandoned',
        data: {
          cartId: cart.id,
          userId: cart.userId,
          userEmail: cart.userEmail,
          items: cart.items,
          subtotal: cart.subtotal,
          currency: cart.currency,
          restoreUrl: `https://muni.ug/cart/restore/${cart.id}`,
        },
      });
    }
  }
}

export const abandonedCartService = new AbandonedCartService();
