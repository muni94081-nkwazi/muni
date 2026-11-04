import { randomId, randomInt, randomBool, randomDateBetween, pickOne, pickMany } from './mockUtils';
import type { RepricerRule, RepricerStrategy, DiscountSchedule, VolumeTier } from '@/types/pricing.types';

export interface MockProduct {
  id: string;
  name: string;
  price: number;
}

// Shared product catalog referenced by repricer rules, discount schedules, and volume tiers
// so the mocked UI reads as one consistent catalog across the pricing pages.
export const MOCK_PRODUCTS: MockProduct[] = [
  { id: 'prod-1001', name: 'Samsung Galaxy S24 Ultra', price: 4090000 },
  { id: 'prod-1002', name: 'Apple iPhone 15 Pro', price: 5200000 },
  { id: 'prod-1003', name: 'Sony WH-1000XM5 Headphones', price: 980000 },
  { id: 'prod-1004', name: 'HP Pavilion 15 Laptop', price: 3200000 },
  { id: 'prod-1005', name: 'Xiaomi Redmi Note 13', price: 890000 },
  { id: 'prod-1006', name: 'LG 55" 4K Smart TV', price: 2450000 },
  { id: 'prod-1007', name: 'JBL Flip 6 Bluetooth Speaker', price: 320000 },
  { id: 'prod-1008', name: 'Dell Inspiron 14 Laptop', price: 2850000 },
  { id: 'prod-1009', name: 'Anker PowerCore 20000mAh', price: 145000 },
  { id: 'prod-1010', name: 'Canon EOS M50 Camera', price: 2100000 },
  { id: 'prod-1011', name: 'Fitbit Charge 6', price: 480000 },
  { id: 'prod-1012', name: 'Logitech MX Master 3S Mouse', price: 260000 },
  { id: 'prod-1013', name: 'Nike Air Max 270', price: 380000 },
  { id: 'prod-1014', name: 'Instant Pot Duo 7-in-1', price: 410000 },
  { id: 'prod-1015', name: 'Philips Air Fryer XXL', price: 620000 },
];

const STRATEGIES: RepricerStrategy[] = ['match_lowest', 'beat_buybox', 'fixed_margin'];

const STRATEGY_LABELS: Record<RepricerStrategy, string> = {
  match_lowest: 'Match Lowest Price',
  beat_buybox: 'Beat Buy Box',
  fixed_margin: 'Fixed Margin',
};

export function generateRepricerRules(count = 10): RepricerRule[] {
  const products = pickMany(MOCK_PRODUCTS, Math.min(count, MOCK_PRODUCTS.length));
  return Array.from({ length: count }).map((_, i) => {
    const product = products[i % products.length] ?? pickOne(MOCK_PRODUCTS);
    const strategy = pickOne(STRATEGIES);
    const currentPrice = randomInt(Math.round(product.price * 0.85), Math.round(product.price * 1.1));
    const minPrice = Math.round(currentPrice * 0.85);
    const maxPrice = Math.round(currentPrice * 1.15);

    return {
      id: randomId('rpr'),
      name: `${product.name} — ${STRATEGY_LABELS[strategy]}`,
      productId: product.id,
      productName: product.name,
      strategy,
      beatByAmount: strategy === 'beat_buybox' ? randomInt(1000, 25000) : undefined,
      minPrice,
      maxPrice,
      currentPrice,
      isActive: randomBool(0.7),
      lastAppliedAt: randomBool(0.8)
        ? randomDateBetween(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date())
        : undefined,
    };
  });
}

export function generateDiscountSchedules(count = 8): DiscountSchedule[] {
  const products = pickMany(MOCK_PRODUCTS, Math.min(count, MOCK_PRODUCTS.length));
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return Array.from({ length: count }).map((_, i) => {
    const product = products[i % products.length] ?? pickOne(MOCK_PRODUCTS);
    const startsAt = new Date(now + randomInt(-3, 5) * day);
    const endsAt = new Date(startsAt.getTime() + randomInt(2, 10) * day);

    return {
      id: randomId('disc'),
      productId: product.id,
      productName: product.name,
      discountPercent: randomInt(5, 40),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      isStrikeThrough: randomBool(0.75),
    };
  });
}

export function generateVolumeTiers(count = 12): VolumeTier[] {
  const products = pickMany(MOCK_PRODUCTS, Math.min(5, MOCK_PRODUCTS.length));
  const tiers: VolumeTier[] = [];
  let remaining = count;

  for (const product of products) {
    if (remaining <= 0) break;
    const numTiers = Math.min(remaining, randomInt(2, 3));
    let minQuantity = randomInt(3, 5);
    let discountPercent = randomInt(5, 10);

    for (let i = 0; i < numTiers; i++) {
      tiers.push({
        id: randomId('vt'),
        productId: product.id,
        minQuantity,
        discountPercent,
      });
      minQuantity += randomInt(3, 7);
      discountPercent += randomInt(3, 8);
      remaining--;
    }
  }

  return tiers;
}
