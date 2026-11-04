import { randomUUID } from 'node:crypto';
import type { ProductViewEvent, ProductPurchaseEvent } from '../models/recommendation.model.js';

// ─── In-Memory Interaction Store ───────────────────────────────────────────────
// Shared by the recommendation engine, item-similarity, and affinity services.
// A real deployment would back this with a warehouse/feature store; the shape
// here (flat event logs + a product catalog) is what all the math operates on.

export interface CartAddEvent {
  id: string;
  userId: string;
  productId: string;
  timestamp: number;
}

export const PRODUCT_CATALOG: Record<string, { name: string; price: number; category: string; imageUrl: string }> = {
  'phone-001': { name: 'Samsung Galaxy S24 Ultra', price: 4200000, category: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf' },
  'phone-002': { name: 'iPhone 15 Pro Max',       price: 4800000, category: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab' },
  'case-001':  { name: 'Silicone Protective Case',  price:   45000, category: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb' },
  'charger-001':{ name: '45W Fast Wall Charger',   price:   85000, category: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0' },
  'buds-001':  { name: 'Wireless Earbuds Pro',     price:  350000, category: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df' },
  'food-001':  { name: 'Organic Coffee Beans 1kg',  price:   45000, category: 'groceries',   imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e' },
  'food-002':  { name: 'Pure Bee Honey 500g',      price:   25000, category: 'groceries',   imageUrl: 'https://images.unsplash.com/photo-1587049352847-4a222e784d38' },
  'fashion-001':{ name: 'Cotton Crewneck T-Shirt', price:   35000, category: 'fashion',     imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518' },
};

export const viewEvents: ProductViewEvent[] = [];
export const purchaseEvents: ProductPurchaseEvent[] = [];
export const cartAddEvents: CartAddEvent[] = [];

export function recordView(userId: string, productId: string, category?: string, timestamp = Date.now()): void {
  viewEvents.push({ id: randomUUID(), userId, productId, category, timestamp });
}

export function recordPurchase(userId: string, productId: string, orderId: string, timestamp = Date.now()): void {
  purchaseEvents.push({ id: randomUUID(), userId, productId, orderId, timestamp });
}

export function recordCartAdd(userId: string, productId: string, timestamp = Date.now()): void {
  cartAddEvents.push({ id: randomUUID(), userId, productId, timestamp });
}

// Seed sample historical data so every strategy has realistic results out of the box.
function seedHistoricalData() {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  // Users co-viewing phone-001 with case-001, charger-001, buds-001
  const users = ['user-101', 'user-102', 'user-103', 'user-104', 'user-105'];
  for (const u of users) {
    recordView(u, 'phone-001', 'electronics', now - 30 * 60 * 1000);
    recordView(u, 'case-001', 'electronics', now - 25 * 60 * 1000);
    recordView(u, 'charger-001', 'electronics', now - 20 * 60 * 1000);
  }

  // Users co-purchasing phone-001 with case-001 and charger-001
  for (let i = 0; i < 4; i++) {
    const orderId = `ord-seed-${i}`;
    recordPurchase(users[i], 'phone-001', orderId, now - 2 * ONE_HOUR);
    recordPurchase(users[i], 'case-001', orderId, now - 2 * ONE_HOUR);
    recordPurchase(users[i], 'charger-001', orderId, now - 2 * ONE_HOUR);
  }

  // Recent cart adds — feeds trending velocity
  recordCartAdd('user-101', 'buds-001', now - 15 * 60 * 1000);
  recordCartAdd('user-102', 'buds-001', now - 10 * 60 * 1000);

  // Recent views for user-123
  recordView('user-123', 'phone-001', 'electronics', now - 10 * 60 * 1000); // 10 min ago (< 24h)
  recordView('user-123', 'food-001', 'groceries', now - 3 * 24 * ONE_HOUR); // 3 days ago
  recordPurchase('user-123', 'food-001', 'ord-prev-1', now - 2 * 24 * ONE_HOUR); // Already bought food-001
}

seedHistoricalData();
