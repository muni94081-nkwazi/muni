export type ContainerType =
  | 'TRENDING'
  | 'DEALS'
  | 'NEW_ARRIVALS'
  | 'FEATURED'
  | 'CATEGORY'
  | 'SELLER_PICKS'
  | 'RECOMMENDED'
  | 'FLASH_SALE'
  | 'CUSTOM';

export type RuleType =
  | 'CATEGORY'
  | 'SELLER'
  | 'PRICE_RANGE'
  | 'MIN_RATING'
  | 'IN_STOCK_ONLY'
  | 'DISCOUNT_PERCENTAGE'
  | 'TAG'
  | 'CUSTOM';

export interface ContainerProductItem {
  id: string;
  containerId: string;
  productId: string;
  sortOrder: number;
  addedBy: string;
  addedAt: string;
  expiresAt?: string | null;
  reason?: string | null;
  // Resolved product metadata for rendering
  productDetails?: {
    id: string;
    name: string;
    slug: string;
    price: number;
    originalPrice?: number;
    currency: string;
    rating: number;
    reviewsCount: number;
    image: string;
    category?: string;
    inStock: boolean;
    badge?: string;
    sellerName?: string;
  };
}

export interface ContainerRuleItem {
  id: string;
  containerId: string;
  ruleType: RuleType;
  value: Record<string, any>;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContainerModel {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  type: ContainerType;
  icon?: string | null;
  displayMode: 'grid' | 'carousel' | 'list' | 'featured';
  itemsPerRow: number;
  maxItems: number;
  isActive: boolean;
  sortOrder: number;
  bgColor?: string | null;
  createdAt: string;
  updatedAt: string;
  products: ContainerProductItem[];
  rules: ContainerRuleItem[];
}

export interface CreateContainerInput {
  slug: string;
  name: string;
  description?: string;
  type: ContainerType;
  icon?: string;
  displayMode?: 'grid' | 'carousel' | 'list' | 'featured';
  itemsPerRow?: number;
  maxItems?: number;
  isActive?: boolean;
  sortOrder?: number;
  bgColor?: string;
}

export interface SellerSubmission {
  id: string;
  sellerId: string;
  sellerName: string;
  containerId: string;
  containerName: string;
  productId: string;
  productName: string;
  pitch: string;
  proposedPrice?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}
