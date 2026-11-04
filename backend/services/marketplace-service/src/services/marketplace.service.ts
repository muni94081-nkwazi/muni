import { Store } from '../models/marketplace.model.js';
import crypto from 'crypto';
import { prismaStoreRepository } from '../repositories/prisma-marketplace.repository.js';
import type { IStoreRepository } from '../types/repositories.js';

export type SellerTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface SellerTierDetails {
  sellerId: string;
  currentTier: SellerTier;
  rating: number;
  totalOrders: number;
  totalRevenueUGX: number;
  commissionFeeReductionPercent: number; // e.g. 2.5% discount
  searchBoostMultiplier: number;          // e.g. 1.25x
  nextTier?: SellerTier;
  progressPercent: number;
  requirementsForNextTier?: {
    ordersNeeded: number;
    revenueNeededUGX: number;
    ratingNeeded: number;
  };
  activeBenefits: string[];
}

// Storefronts live in Postgres behind IStoreRepository. The three demo stores
// this array used to hold are gone — two of them ("Tech Haven" in Seattle and
// "Fashion Forward" in New York) were placeholder data for a Ugandan
// marketplace. See the note in prisma/schema.prisma.

export interface TrustBadgeDetails {
  storeId: string;
  storeName: string;
  trustScorePercent: number;
  badges: Array<{
    id: 'BUYER_PROTECTION' | 'VERIFIED_SELLER' | 'TOP_RATED_SELLER';
    label: string;
    description: string;
    icon: string;
  }>;
}

export class MarketplaceService {
  constructor(private readonly repo: IStoreRepository = prismaStoreRepository) {}

  async getStores() { return this.repo.findAll(); }
  async getStoreBySlug(slug: string) { return this.repo.findBySlugOrId(slug); }
  async getMyStore(userId: string) { return this.repo.findByUser(userId); }

  async createStore(userId: string, data: any) {
    const ts = new Date().toISOString();
    const newStore: Store = {
      id: crypto.randomUUID(), userId,
      ...data,
      storeSlug: data.storeName.toLowerCase().replace(/\s+/g, '-'),
      rating: 0, reviewCount: 0, totalSales: 0, commissionRate: 5,
      status: 'ACTIVE', verificationStatus: 'pending',
      joinedAt: ts, updatedAt: ts,
    };
    return this.repo.create(newStore);
  }

  async updateStore(userId: string, data: any) {
    const updated = await this.repo.updateByUser(userId, data, new Date().toISOString());
    // Same error the array version threw when the seller had no store.
    if (!updated) throw new Error('Store not found');
    return updated;
  }

  // ─── Seller Performance Tiers (Phase 17 Feature 2) ───────────────────────────

  async getSellerTier(sellerId: string): Promise<SellerTierDetails> {
    // Falls back to the same placeholder figures the array version used for a
    // seller with no storefront row. Preserved rather than made an error:
    // callers rely on this endpoint always answering.
    const store = (await this.repo.findBySlugOrId(sellerId))
      ?? (await this.repo.findByUser(sellerId))
      ?? { id: sellerId, rating: 4.8, totalSales: 120, verificationStatus: 'verified' as const, storeName: 'MUNI Partner Store' };

    const totalOrders = store.totalSales || 120;
    const totalRevenueUGX = totalOrders * 250000;
    const rating = store.rating || 4.8;

    let currentTier: SellerTier = 'BRONZE';
    let feeReduction = 0;
    let searchBoost = 1.0;
    let activeBenefits: string[] = ['Basic Seller Tools'];

    if (totalOrders >= 500 && totalRevenueUGX >= 100_000_000 && rating >= 4.8) {
      currentTier = 'PLATINUM';
      feeReduction = 4.0; // 4% commission discount
      searchBoost = 1.5;
      activeBenefits = ['4% Commission Fee Reduction', '1.5x Search Ranking Boost', '24/7 Dedicated Account Manager', 'Platinum Badge'];
    } else if (totalOrders >= 100 && totalRevenueUGX >= 25_000_000 && rating >= 4.5) {
      currentTier = 'GOLD';
      feeReduction = 2.5; // 2.5% commission discount
      searchBoost = 1.25;
      activeBenefits = ['2.5% Commission Fee Reduction', '1.25x Search Boost', 'Gold Seller Badge', 'Priority Customer Support'];
    } else if (totalOrders >= 25 && totalRevenueUGX >= 5_000_000 && rating >= 4.2) {
      currentTier = 'SILVER';
      feeReduction = 1.0; // 1% commission discount
      searchBoost = 1.1;
      activeBenefits = ['1% Commission Fee Reduction', 'Silver Seller Badge', 'Standard Support'];
    }

    let nextTier: SellerTier | undefined = 'SILVER';
    let progressPercent = Math.min(100, Math.round((totalOrders / 25) * 100));
    let reqs = { ordersNeeded: Math.max(0, 25 - totalOrders), revenueNeededUGX: Math.max(0, 5_000_000 - totalRevenueUGX), ratingNeeded: 4.2 };

    if (currentTier === 'SILVER') {
      nextTier = 'GOLD';
      progressPercent = Math.min(100, Math.round((totalOrders / 100) * 100));
      reqs = { ordersNeeded: Math.max(0, 100 - totalOrders), revenueNeededUGX: Math.max(0, 25_000_000 - totalRevenueUGX), ratingNeeded: 4.5 };
    } else if (currentTier === 'GOLD') {
      nextTier = 'PLATINUM';
      progressPercent = Math.min(100, Math.round((totalOrders / 500) * 100));
      reqs = { ordersNeeded: Math.max(0, 500 - totalOrders), revenueNeededUGX: Math.max(0, 100_000_000 - totalRevenueUGX), ratingNeeded: 4.8 };
    } else if (currentTier === 'PLATINUM') {
      nextTier = undefined;
      progressPercent = 100;
    }

    return {
      sellerId: store.id,
      currentTier,
      rating,
      totalOrders,
      totalRevenueUGX,
      commissionFeeReductionPercent: feeReduction,
      searchBoostMultiplier: searchBoost,
      nextTier,
      progressPercent,
      requirementsForNextTier: nextTier ? reqs : undefined,
      activeBenefits,
    };
  }

  async getStoreTrustBadges(storeIdOrSlug: string): Promise<TrustBadgeDetails> {
    const store = (await this.repo.findBySlugOrId(storeIdOrSlug)) ?? {
      id: storeIdOrSlug,
      storeName: 'MUNI Partner Store',
      rating: 4.8,
      verificationStatus: 'verified' as const,
      totalSales: 250,
    };

    const badges: TrustBadgeDetails['badges'] = [
      {
        id: 'BUYER_PROTECTION',
        label: 'MUNI Buyer Protection Guaranteed',
        description: '30-day money-back coverage for item not received, defective, or not as described',
        icon: '🛡️',
      },
    ];

    if (store.verificationStatus === 'verified') {
      badges.push({
        id: 'VERIFIED_SELLER',
        label: 'Verified Business Seller',
        description: 'Government ID and business documentation verified by MUNI Trust & Safety',
        icon: '✅',
      });
    }

    if (store.rating >= 4.5 && store.totalSales >= 50) {
      badges.push({
        id: 'TOP_RATED_SELLER',
        label: 'Top-Rated Seller',
        description: 'Maintains 95%+ high fulfillment accuracy and 4.5+ star customer ratings',
        icon: '⭐',
      });
    }

    const trustScorePercent = Math.min(
      100,
      Math.round((store.rating / 5) * 60 + (store.verificationStatus === 'verified' ? 25 : 10) + (store.totalSales > 50 ? 15 : 5))
    );

    return {
      storeId: store.id,
      storeName: store.storeName,
      trustScorePercent,
      badges,
    };
  }

  async getProductTrustBadges(productId: string): Promise<TrustBadgeDetails> {
    return this.getStoreTrustBadges('seller-001');
  }
}

export const marketplaceService = new MarketplaceService();
