export interface ProductViewEvent {
  id: string;
  userId: string;
  productId: string;
  category?: string;
  timestamp: number; // Unix timestamp in ms
}

export interface ProductPurchaseEvent {
  id: string;
  userId: string;
  productId: string;
  orderId: string;
  timestamp: number; // Unix timestamp in ms
}

export interface RecommendationItem {
  productId: string;
  score: number; // 0.0 to 1.0
  reason: 'also_viewed' | 'also_bought' | 'frequently_bought_together' | 'personalized' | 'trending' | 'popular';
  category?: string;
  name?: string;
  price?: number;
  imageUrl?: string;
}

export interface BundleItem {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
}

export interface BundleRecommendation {
  primaryProductId: string;
  bundleItems: BundleItem[];
  originalTotalPrice: number;
  bundleDiscountPercent: number; // auto-calculated from association-rule confidence
  bundleDiscountPrice: number;   // original * (1 - discountPercent / 100)
  savingsAmount: number;         // original - discountPrice
  reason: string;
}

// ─── Item-to-Item Similarity & Association Mining ──────────────────────────────

/** A market-basket association rule: {productId} co-purchased with the target item. */
export interface AssociationRule {
  productId: string;
  coOccurrences: number;
  support: number;    // P(target ∩ productId) across all orders
  confidence: number; // P(productId | target)
  lift: number;       // confidence / P(productId) — >1 means positively associated
}

// ─── Real-Time Clickstream & User Affinity ─────────────────────────────────────

export type ClickstreamEventType = 'product_view' | 'category_browse' | 'add_to_cart' | 'wishlist';

export interface ClickstreamEvent {
  userId: string;
  eventType: ClickstreamEventType;
  productId?: string;
  category?: string;
  timestamp: number; // Unix timestamp in ms
}

/** Dynamic per-user preference profile built from decayed clickstream signals. */
export interface UserAffinityProfile {
  userId: string;
  categoryAffinity: Record<string, number>;
  productAffinity: Record<string, number>;
  updatedAt: string; // ISO timestamp
}

// ─── Home Feed ──────────────────────────────────────────────────────────────────

export interface HomeFeedSection {
  key: string;
  title: string;
  reason: string;
  items: RecommendationItem[];
}

export interface HomeFeedResponse {
  userId: string;
  sections: HomeFeedSection[];
  generatedAt: string;
}
