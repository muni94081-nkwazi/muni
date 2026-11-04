import { randomFloat } from './mockUtils';
import type { PriceHistoryPoint } from '@/types/pricing.types';

// Cheap string hash so the same productId always seeds the same starting price —
// keeps a given product's chart stable across re-renders without a global reseed.
function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Generates a plausible random-walk price series for a product alongside a competitor
 * price series that trends similarly (loosely mean-reverts toward our price) without
 * ever being identical.
 */
export function generatePriceHistory(productId: string, days = 30): PriceHistoryPoint[] {
  const seed = hashSeed(productId);
  let price = 50000 + (seed % 450000);
  let competitor = price * randomFloat(0.94, 1.06);

  const points: PriceHistoryPoint[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    price = Math.max(5000, price + randomFloat(-price * 0.03, price * 0.03));
    competitor = Math.max(5000, competitor + randomFloat(-competitor * 0.035, competitor * 0.035));
    // Loosely trend the competitor price toward ours so the two series track without merging.
    competitor += (price - competitor) * 0.08;

    points.push({
      date: date.toISOString().slice(0, 10),
      price: Math.round(price),
      competitorPrice: Math.round(competitor),
    });
  }

  return points;
}
