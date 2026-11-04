import { describe, it, expect, beforeEach } from '@jest/globals';
import { MarketplaceService } from '../services/marketplace.service.js';
import { MemoryStoreRepository } from '../repositories/memory-marketplace.repository.js';
import type { Store } from '../models/marketplace.model.js';

let repo: MemoryStoreRepository;
let service: MarketplaceService;

beforeEach(() => {
  repo = new MemoryStoreRepository();
  service = new MarketplaceService(repo);
});

const storeFixture = (over: Partial<Store> = {}): Store => ({
  id: 'seller-001',
  userId: 'u-101',
  storeName: 'Kampala Electronics Hub',
  storeSlug: 'kampala-electronics',
  description: 'Best electronics in Uganda.',
  categories: ['Electronics'],
  location: { city: 'Kampala', country: 'UG' },
  rating: 4.8,
  reviewCount: 120,
  totalSales: 500,
  commissionRate: 5,
  status: 'ACTIVE',
  verificationStatus: 'verified',
  joinedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('MarketplaceService against a repository', () => {
  it('starts with no stores rather than demo data', async () => {
    expect(await service.getStores()).toHaveLength(0);
  });

  it('creates a store, derives its slug and persists it', async () => {
    const created = await service.createStore('u-200', {
      storeName: 'Ntinda Fresh Produce',
      description: 'Fruit and veg.',
      categories: ['Grocery'],
      location: { city: 'Kampala', country: 'UG' },
    });

    expect(created.storeSlug).toBe('ntinda-fresh-produce');
    expect(created.verificationStatus).toBe('pending');
    expect(await repo.findByUser('u-200')).toBeDefined();
  });

  it('finds a store by slug or by id', async () => {
    repo.seed(storeFixture());

    expect(await service.getStoreBySlug('kampala-electronics')).toBeDefined();
    expect(await service.getStoreBySlug('seller-001')).toBeDefined();
    expect(await service.getStoreBySlug('nope')).toBeUndefined();
  });

  it('updates a seller store, persistently', async () => {
    repo.seed(storeFixture());

    await service.updateStore('u-101', { description: 'Updated copy.' });

    expect((await repo.findByUser('u-101'))!.description).toBe('Updated copy.');
  });

  it('throws when a seller with no store tries to update one', async () => {
    await expect(service.updateStore('nobody', { description: 'x' })).rejects.toThrow('Store not found');
  });

  describe('seller tiers', () => {
    it('promotes a high-volume, highly-rated store to PLATINUM', async () => {
      repo.seed(storeFixture({ totalSales: 500, rating: 4.9 }));

      const tier = await service.getSellerTier('seller-001');
      expect(tier.currentTier).toBe('PLATINUM');
      expect(tier.nextTier).toBeUndefined();
      expect(tier.commissionFeeReductionPercent).toBe(4);
    });

    it('places a small store in BRONZE with SILVER as the next step', async () => {
      repo.seed(storeFixture({ id: 's-small', userId: 'u-small', storeSlug: 'small', totalSales: 5, rating: 4.0 }));

      const tier = await service.getSellerTier('s-small');
      expect(tier.currentTier).toBe('BRONZE');
      expect(tier.nextTier).toBe('SILVER');
      expect(tier.requirementsForNextTier!.ordersNeeded).toBe(20);
    });

    it('still answers for a seller with no storefront row', async () => {
      // Preserved: the array version fell back to placeholder figures rather
      // than erroring, and callers depend on this endpoint always answering.
      const tier = await service.getSellerTier('unknown-seller');
      expect(tier.sellerId).toBe('unknown-seller');
      expect(tier.currentTier).toBeDefined();
    });
  });

  describe('trust badges', () => {
    it('always grants buyer protection', async () => {
      repo.seed(storeFixture());
      const badges = await service.getStoreTrustBadges('seller-001');
      expect(badges.badges.some((b) => b.id === 'BUYER_PROTECTION')).toBe(true);
    });

    it('grants the verified badge only to a verified store', async () => {
      repo.seed(storeFixture({ verificationStatus: 'pending' }));
      const badges = await service.getStoreTrustBadges('seller-001');
      expect(badges.badges.some((b) => b.id === 'VERIFIED_SELLER')).toBe(false);
    });
  });
});
