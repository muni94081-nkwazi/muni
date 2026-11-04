export interface Category {
  id: string;
  name: string;
}

/** Mirrors product-service's ProductStatus enum. */
export type ProductStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'DRAFT'
  | 'ARCHIVED'
  | 'OUT_OF_STOCK';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  categoryId: string;
  stockQuantity: number;
  weight?: number;
  status: ProductStatus;
  imageUrls: string[];

  // ── Engagement (derived by product-service, read-only here) ──────────────
  //
  // These are real columns on the Product row and formatProduct has always
  // returned them; they were simply missing from this interface, so any code
  // reading them failed to compile even though the data was on the wire.
  /** Product detail page views. */
  viewCount?: number;
  /** Mean review score, 0 when there are no reviews. */
  averageRating?: number;
  reviewCount?: number;

  /** True when any active variant has stock left after reservations. */
  inStock?: boolean;
  /** True when a variant is at or below its low-stock threshold. */
  lowStock?: boolean;

  // ── Moderation (set by product-service, read-only here) ──────────────────
  /** Why an admin declined the listing. Present only when status is REJECTED. */
  rejectionReason?: string | null;
  /** When the listing last entered the approval queue. */
  submittedAt?: string | null;
  /** When an admin last acted on it. */
  moderatedAt?: string | null;
}

export type CreateProductPayload = Omit<Product, 'id' | 'status'>;
export interface UpdateProductPayload extends Partial<CreateProductPayload> {
  status?: Product['status'];
}

export interface VariantAttribute {
  color?: string;
  size?: string;
  material?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  attributes: VariantAttribute;
  sku: string;
  price: number;
  stockQuantity: number;
  upc: string;
}

export type MediaAssetType = 'image' | 'video_link' | '360_link';

export interface MediaAsset {
  id: string;
  type: MediaAssetType;
  url: string;
  isMain: boolean;
  widthPx?: number;
  heightPx?: number;
  meetsPhotoStandards: boolean;
}

export interface ListingQualityCheck {
  key: 'titleLength' | 'bulletPoints' | 'imageResolution' | 'backendKeywords' | 'description';
  label: string;
  passed: boolean;
  message: string;
}

export interface ListingQualityScore {
  productId: string;
  score: number;
  checks: ListingQualityCheck[];
}

export interface BulkImportRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  isValid: boolean;
}
