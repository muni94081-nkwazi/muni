/** Mirrors product-service's ProductStatus enum. */
export type ProductStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'DRAFT'
  | 'ARCHIVED'
  | 'OUT_OF_STOCK';

/**
 * The product payload as product-service's formatProduct() emits it.
 *
 * This replaces a hand-written shape with a `moderationStatus: 'pending' |
 * 'approved' | 'flagged' | 'rejected'` field that had no server-side
 * counterpart — it existed only in the mocked API this file used to back.
 */
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  stockQuantity: number;
  inStock: boolean;
  category: { id: string; name: string; slug: string; path: string } | null;
  brand: string | null;
  sellerId: string;
  status: ProductStatus;
  imageUrls: string[];
  tags: string[];
  averageRating: number;
  reviewCount: number;

  // ── Moderation ───────────────────────────────────────────────────────────
  rejectionReason: string | null;
  submittedAt: string | null;
  moderatedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

export type ModerationCounts = Partial<Record<ProductStatus, number>>;
