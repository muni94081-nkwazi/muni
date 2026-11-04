import type {
  RecommendationItem,
  BundleRecommendation,
  BundleItem,
  HomeFeedResponse,
  HomeFeedSection,
} from '../models/recommendation.model.js';
import { cache } from '../../../../shared/cache/redis.js';
import { PRODUCT_CATALOG, viewEvents, purchaseEvents, cartAddEvents, recordView, recordPurchase } from '../store/event-store.js';
import { itemSimilarityService, computeBundleDiscountPercent } from './similarity.service.js';
import { userAffinityService } from './affinity.service.js';

const CACHE_TTL_SEC = 60 * 60; // 1 hour, per the platform's recommendation caching policy

export class RecommendationEngineService {
  /** Record user product view event */
  async trackView(userId: string, productId: string, category?: string): Promise<void> {
    recordView(userId, productId, category);
    void cache.del(`recommendations:user:${userId}:personalized`);
    void cache.del(`recommendations:home-feed:${userId}`);
  }

  /** Record purchase event */
  async trackPurchase(userId: string, productId: string, orderId: string): Promise<void> {
    recordPurchase(userId, productId, orderId);
    void cache.del(`recommendations:user:${userId}:personalized`);
    void cache.del(`recommendations:home-feed:${userId}`);
  }

  // ─── Strategy 1: "Customers Also Viewed" (View-Based Collaborative Filtering) ─

  async getCustomersAlsoViewed(productId: string, limit = 6): Promise<RecommendationItem[]> {
    const cacheKey = `recommendations:also-viewed:${productId}`;
    return cache.getOrSet(cacheKey, CACHE_TTL_SEC, async () => {
      // Find all users who viewed target productId
      const usersWhoViewedTarget = new Set(
        viewEvents.filter((v) => v.productId === productId).map((v) => v.userId)
      );

      if (usersWhoViewedTarget.size === 0) {
        return this.getTrendingNow(limit);
      }

      // Count co-occurrences of other products viewed by those users
      const coViewCounts = new Map<string, number>();
      for (const event of viewEvents) {
        if (usersWhoViewedTarget.has(event.userId) && event.productId !== productId) {
          coViewCounts.set(event.productId, (coViewCounts.get(event.productId) || 0) + 1);
        }
      }

      const sorted = [...coViewCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

      if (sorted.length === 0) return this.getTrendingNow(limit);

      const maxCount = sorted[0][1];
      return sorted.map(([pid, count]) => {
        const meta = PRODUCT_CATALOG[pid];
        return {
          productId: pid,
          score:     Math.round((count / maxCount) * 100) / 100,
          reason:    'also_viewed' as const,
          name:      meta?.name ?? `Product ${pid}`,
          price:     meta?.price ?? 50000,
          category:  meta?.category ?? 'general',
          imageUrl:  meta?.imageUrl,
        };
      });
    });
  }

  // ─── Strategy 2: "Customers Who Bought This Also Bought" (Item-Item Similarity) ─

  async getCustomersAlsoBought(productId: string, limit = 6): Promise<RecommendationItem[]> {
    const cacheKey = `recommendations:also-bought:${productId}`;
    return cache.getOrSet(cacheKey, CACHE_TTL_SEC, async () => {
      const similar = itemSimilarityService.getSimilarProducts(productId, limit);
      if (similar.length === 0) return this.getTrendingNow(limit);

      return similar.map(({ productId: pid, score }) => {
        const meta = PRODUCT_CATALOG[pid];
        return {
          productId: pid,
          score,
          reason:    'also_bought' as const,
          name:      meta?.name ?? `Product ${pid}`,
          price:     meta?.price ?? 50000,
          category:  meta?.category ?? 'general',
          imageUrl:  meta?.imageUrl,
        };
      });
    });
  }

  // ─── Strategy 3: "Frequently Bought Together" (Association Mining + Auto Discount) ─

  async getFrequentlyBoughtTogether(productId: string): Promise<BundleRecommendation> {
    const cacheKey = `recommendations:fbt:${productId}`;
    return cache.getOrSet(cacheKey, CACHE_TTL_SEC, async () => {
      const rules = itemSimilarityService.getAssociationRules(productId, 2);
      const bundleProductIds = rules.length > 0 ? rules.map((r) => r.productId) : ['case-001', 'charger-001'];

      const primaryMeta = PRODUCT_CATALOG[productId] ?? { name: `Product ${productId}`, price: 100000 };
      const bundleItems: BundleItem[] = bundleProductIds.map((pid) => {
        const meta = PRODUCT_CATALOG[pid] ?? { name: `Item ${pid}`, price: 45000 };
        return {
          productId: pid,
          name:      meta.name,
          price:     meta.price,
          imageUrl:  meta.imageUrl,
        };
      });

      const originalTotalPrice = primaryMeta.price + bundleItems.reduce((sum, item) => sum + item.price, 0);

      // Auto-calculate the discount from how strongly the items are associated —
      // rules found in the data drive the number; no data falls back to a flat
      // starter incentive (see computeBundleDiscountPercent).
      const avgConfidence = rules.length > 0
        ? rules.reduce((sum, r) => sum + r.confidence, 0) / rules.length
        : 0;
      const bundleDiscountPercent = computeBundleDiscountPercent(avgConfidence);
      const bundleDiscountPrice = Math.round(originalTotalPrice * (1 - bundleDiscountPercent / 100));
      const savingsAmount = originalTotalPrice - bundleDiscountPrice;

      return {
        primaryProductId: productId,
        bundleItems,
        originalTotalPrice,
        bundleDiscountPercent,
        bundleDiscountPrice,
        savingsAmount,
        reason: `Buy this with these items and save ${bundleDiscountPercent}%`,
      };
    });
  }

  // ─── Strategy 4: "Personalized For You" (Recency Weighting & Exclusions) ────

  async getPersonalizedForUser(userId: string, limit = 10): Promise<RecommendationItem[]> {
    const cacheKey = `recommendations:user:${userId}:personalized`;
    return cache.getOrSet(cacheKey, CACHE_TTL_SEC, async () => {
      const now = Date.now();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

      // Purchased products to exclude
      const purchasedProductIds = new Set(
        purchaseEvents.filter((p) => p.userId === userId).map((p) => p.productId)
      );

      // Recency-weighted view scoring
      const categoryScores = new Map<string, number>();
      const productScores = new Map<string, number>();

      for (const view of viewEvents.filter((v) => v.userId === userId)) {
        if (purchasedProductIds.has(view.productId)) continue; // Exclude purchased

        const ageMs = now - view.timestamp;
        let weight = 0.5; // Older view default
        if (ageMs < TWENTY_FOUR_HOURS) {
          weight = 3.0; // Recent view < 24h
        } else if (ageMs < SEVEN_DAYS) {
          weight = 1.5; // View < 7 days
        }

        if (view.category) {
          categoryScores.set(view.category, (categoryScores.get(view.category) || 0) + weight);
        }
        productScores.set(view.productId, (productScores.get(view.productId) || 0) + weight);
      }

      // Fold in real-time clickstream affinity (product_view/category_browse/add_to_cart/wishlist)
      const affinity = await userAffinityService.getProfile(userId);
      for (const [category, score] of Object.entries(affinity.categoryAffinity)) {
        categoryScores.set(category, (categoryScores.get(category) || 0) + score);
      }
      for (const [pid, score] of Object.entries(affinity.productAffinity)) {
        productScores.set(pid, (productScores.get(pid) || 0) + score);
      }

      // Recommend candidates in user's top categories excluding already purchased
      const candidates: RecommendationItem[] = [];
      const topCategories = [...categoryScores.entries()].sort((a, b) => b[1] - a[1]).map(([cat]) => cat);

      for (const [pid, meta] of Object.entries(PRODUCT_CATALOG)) {
        if (purchasedProductIds.has(pid)) continue; // Exclude purchased

        let score = productScores.get(pid) || 0.2;
        if (topCategories.includes(meta.category)) {
          score += 1.5;
        }

        candidates.push({
          productId: pid,
          score:     Math.min(1.0, Math.round(score * 10) / 100),
          reason:    'personalized',
          name:      meta.name,
          price:     meta.price,
          category:  meta.category,
          imageUrl:  meta.imageUrl,
        });
      }

      candidates.sort((a, b) => b.score - a.score);
      return candidates.slice(0, limit);
    });
  }

  // ─── Strategy 5: "Trending Now" (Conversion Rate & Cart Velocity) ──────────

  async getTrendingNow(limit = 10): Promise<RecommendationItem[]> {
    const cacheKey = 'recommendations:trending';
    return cache.getOrSet(cacheKey, CACHE_TTL_SEC, async () => {
      const now = Date.now();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

      const recentViews = viewEvents.filter((v) => now - v.timestamp < TWENTY_FOUR_HOURS);
      const recentPurchases = purchaseEvents.filter((p) => now - p.timestamp < TWENTY_FOUR_HOURS);
      const recentCartAdds = cartAddEvents.filter((c) => now - c.timestamp < TWENTY_FOUR_HOURS);

      const viewCounts = new Map<string, number>();
      for (const v of recentViews) {
        viewCounts.set(v.productId, (viewCounts.get(v.productId) || 0) + 1);
      }

      const purchaseCounts = new Map<string, number>();
      for (const p of recentPurchases) {
        purchaseCounts.set(p.productId, (purchaseCounts.get(p.productId) || 0) + 1);
      }

      const cartCounts = new Map<string, number>();
      for (const c of recentCartAdds) {
        cartCounts.set(c.productId, (cartCounts.get(c.productId) || 0) + 1);
      }

      const trendingList: RecommendationItem[] = Object.keys(PRODUCT_CATALOG).map((pid) => {
        const views = viewCounts.get(pid) || 1;
        const buys = purchaseCounts.get(pid) || 0;
        const cartAdds = cartCounts.get(pid) || 0;
        const conversionRate = buys / views; // View-to-buy conversion
        const velocityScore = views * 0.4 + cartAdds * 0.8 + conversionRate * 10.0;

        const meta = PRODUCT_CATALOG[pid];
        return {
          productId: pid,
          score:     Math.min(1.0, Math.round(velocityScore * 10) / 100),
          reason:    'trending' as const,
          name:      meta?.name ?? `Product ${pid}`,
          price:     meta?.price ?? 50000,
          category:  meta?.category ?? 'electronics',
          imageUrl:  meta?.imageUrl,
        };
      });

      trendingList.sort((a, b) => b.score - a.score);
      return trendingList.slice(0, limit);
    });
  }

  // ─── Real-Time Home Feed ────────────────────────────────────────────────────
  // Merges the affinity profile built from clickstream events (see
  // affinity.service.ts / clickstream.consumer.ts) with personalized and
  // trending sections. Trending always ships as the last section so the feed
  // never comes back empty for cold-start users.

  async getHomeFeed(userId: string, limit = 8): Promise<HomeFeedResponse> {
    const cacheKey = `recommendations:home-feed:${userId}`;
    return cache.getOrSet(cacheKey, CACHE_TTL_SEC, async () => {
      const sections: HomeFeedSection[] = [];
      const affinity = await userAffinityService.getProfile(userId);

      if (userAffinityService.hasSignal(affinity)) {
        const [topCategory] = userAffinityService.topCategories(affinity, 1);

        if (topCategory) {
          const purchased = new Set(purchaseEvents.filter((p) => p.userId === userId).map((p) => p.productId));
          const categoryItems: RecommendationItem[] = Object.entries(PRODUCT_CATALOG)
            .filter(([pid, meta]) => meta.category === topCategory && !purchased.has(pid))
            .map(([pid, meta]) => ({
              productId: pid,
              score:     Math.min(1.0, Math.round(((affinity.productAffinity[pid] ?? 0.2) * 10)) / 100),
              reason:    'personalized' as const,
              name:      meta.name,
              price:     meta.price,
              category:  meta.category,
              imageUrl:  meta.imageUrl,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

          if (categoryItems.length > 0) {
            sections.push({
              key:   'because-you-browsed',
              title: `Because you browsed ${topCategory}`,
              reason: 'category_affinity',
              items: categoryItems,
            });
          }
        }

        sections.push({
          key:   'picked-for-you',
          title: 'Picked For You',
          reason: 'personalized',
          items: await this.getPersonalizedForUser(userId, limit),
        });
      }

      // Top-trending fallback — always present so the feed is never empty.
      sections.push({
        key:   'trending-now',
        title: 'Trending Now',
        reason: 'trending',
        items: await this.getTrendingNow(limit),
      });

      return { userId, sections, generatedAt: new Date().toISOString() };
    });
  }
}

export const recommendationEngineService = new RecommendationEngineService();
