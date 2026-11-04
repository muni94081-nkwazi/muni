import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { redis } from '../utils/redis.js';
import { abandonedCartRepository } from '../repositories/abandoned-cart.repository.js';
import type { AbandonedCart } from '../models/cart.model.js';

// ─── Cart Service Dev Seed ─────────────────────────────────────────────────────
// Populates Redis with one sample abandoned cart for local testing of the admin
// dashboard. Not run automatically on service startup — invoke explicitly.
//
// Usage: npm run seed   (reads REDIS_URL from the environment / .env)

async function seed(): Promise<void> {
  await redis.connect();

  const pastTime = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 90 minutes inactive
  const sample: AbandonedCart = {
    id: `cart-abandoned-seed-${randomUUID().slice(0, 8)}`,
    userId: 'user-123',
    userEmail: 'customer@muni.ug',
    items: [
      {
        id: randomUUID(),
        productId: 'phone-001',
        sellerId: 'seller-001',
        productName: 'Samsung Galaxy S24 Ultra',
        productImage: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf',
        price: 4200000,
        quantity: 1,
        maxQuantity: 10,
        addedAt: pastTime,
      },
    ],
    subtotal: 4200000,
    total: 4200000,
    currency: 'UGX',
    status: 'abandoned',
    lastActivityAt: pastTime,
    createdAt: pastTime,
  };

  await abandonedCartRepository.save(sample);
  console.log(`[cart-service seed] ✅ Seeded abandoned cart ${sample.id}`);
  redis.disconnect();
}

seed().catch((err) => {
  console.error('[cart-service seed] ❌ Seed failed:', err);
  process.exit(1);
});
