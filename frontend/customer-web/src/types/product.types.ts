export interface Product {
  id: string;
  sku?: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  metaTitle?: string;
  metaDescription?: string;
  
  price: number;
  compareAtPrice?: number;
  currency: string;
  costPrice?: number;
  
  imageUrls: string[];
  images: ProductImage[];
  videos?: ProductVideo[];
  
  inStock: boolean;
  stockQuantity?: number;
  estimatedRestockDate?: string;
  backorderAvailable?: boolean;
  lowStockThreshold?: number;
  
  /**
   * The brand, as product-service returns it: a plain string column on
   * Product, not a related entity.
   *
   * This was typed `Brand` (an object with `id`, `name`, `slug`, `logo`…).
   * Nothing anywhere sends that shape — there is no brands table and no
   * `/brands` route — so every reader did `product.brand?.name`, which is
   * `undefined` on a string, and silently rendered nothing. On the product
   * card that empty string then fell through to a seller fallback, so every
   * card in the catalogue claimed MUNI was the seller.
   */
  brand?: string;
  /**
   * The owning seller, as product-service returns it. This is the seller's
   * USER id and is the value cart-service keys a line on.
   *
   * The API has always sent this; the type only declared the nested `seller`
   * below, which product-service does not send — so every consumer that
   * checked `product.seller` found nothing.
   */
  sellerId?: string;
  /** Enriched store data, when a caller has resolved it. Never sent by the API. */
  seller?: Seller;
  manufacturer?: string;
  variants?: ProductVariant[];
  
  averageRating: number;
  reviewCount: number;
  ratingDistribution?: RatingDistribution;
  
  category?: Category;
  subcategory?: Category;
  categories?: Category[];
  tags?: string[];
  
  badges?: ProductBadges;
  
  delivery?: DeliveryInfo;
  shipping?: ShippingInfo;
  
  flashSale?: FlashSale;
  promotions?: Promotion[];
  
  warranty?: string;
  returnPolicy?: string;
  specifications?: ProductSpecifications;
  features?: string[];
  materials?: string[];
  dimensions?: Dimensions;
  weight?: Weight;
  
  soldCount?: number;
  views?: number;
  wishlistCount?: number;
  questionCount?: number;
  
  seo?: SEOInfo;
  
  status: ProductStatus;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNew?: boolean;
  
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  expiresAt?: string;
}

export interface ProductImage {
  id: string;
  url: string;
  thumbnail?: string;
  medium?: string;
  large?: string;
  alt: string;
  title?: string;
  isDefault: boolean;
  order: number;
  width?: number;
  height?: number;
  size?: number;
}

export interface ProductVideo {
  id: string;
  url: string;
  thumbnail?: string;
  title?: string;
  duration?: number;
  type: 'youtube' | 'vimeo' | 'self-hosted';
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  website?: string;
  isVerified: boolean;
  isFeatured?: boolean;
  rating?: number;
  totalProducts?: number;
}

export interface Seller {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  rating: number;
  totalSales: number;
  totalProducts?: number;
  isVerified: boolean;
  isOfficial: boolean;
  isTopRated?: boolean;
  joinDate: string;
  responseTime?: string;
  responseRate?: number;
  address?: Address;
  returnPolicy?: string;
  shippingPolicy?: string;
  badges?: SellerBadge[];
}

export interface SellerBadge {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  image?: string;
  parentId?: string;
  parent?: Category;
  children?: Category[];
  level: number;
  isActive: boolean;
  order: number;
  productCount?: number;
}

export interface ProductBadges {
  bestSeller?: boolean;
  muniChoice?: string; 
  choice?: string;
  dealOfDay?: boolean;
  limitedTimeDeal?: boolean;
  lightningDeal?: boolean;
  coupon?: string;
  prime?: boolean;
  climatePledge?: boolean;
  premium?: boolean;
  
  payOnDelivery?: boolean;
  muniPay?: boolean;
  mobileMoney?: boolean;
  installment?: boolean;
  storePickup?: boolean;
  verifiedSeller?: boolean;
  officialStore?: boolean;
  authenticProduct?: boolean;
  muniExpress?: boolean;
  
  topRatedPlus?: boolean;
  muniPlus?: boolean;
  moneyBackGuarantee?: boolean;
  authenticityGuarantee?: boolean;
  
  newArrival?: boolean;
  trending?: boolean;
  limitedStock?: boolean;
  exclusive?: boolean;
  awardWinner?: boolean;
  ecoFriendly?: boolean;
  handmade?: boolean;
  organic?: boolean;
  fairTrade?: boolean;
}

export interface DeliveryInfo {
  freeShipping: boolean;
  shippingCost?: number;
  estimatedDays?: number;
  minDeliveryDays?: number;
  maxDeliveryDays?: number;
  deliveryDate?: string;
  primeDelivery?: string;
  availableLocations?: string[];
  internationalShipping?: boolean;
  internationalCost?: number;
  deliveryMethods?: DeliveryMethod[];
}

export interface DeliveryMethod {
  id: string;
  name: string;
  cost: number;
  estimatedDays: number;
  description?: string;
  isDefault: boolean;
}

export interface ShippingInfo {
  weight?: Weight;
  dimensions?: Dimensions;
  shippingClass?: 'standard' | 'expedited' | 'overnight' | 'international';
  handlingTime?: number; // days
  originAddress?: Address;
  restrictions?: string[];
  carrier?: 'fedex' | 'ups' | 'dhl' | 'usps' | 'other';
  trackingAvailable: boolean;
}

export interface FlashSale {
  isActive: boolean;
  salePrice: number;
  originalPrice: number;
  discountPercentage?: number;
  startDate: string;
  endDate: string;
  stockQuantity: number;
  maxPerUser?: number;
  remainingTime?: string;
  soldCount?: number;
}

export interface Promotion {
  id: string;
  type: 'percentage' | 'fixed' | 'bundle' | 'free_shipping' | 'gift';
  name: string;
  description?: string;
  discountValue: number;
  code?: string;
  startDate: string;
  endDate: string;
  minPurchase?: number;
  maxDiscount?: number;
  applicableTo?: 'all' | 'category' | 'brand' | 'specific';
  applicableIds?: string[];
  usageLimit?: number;
  usedCount?: number;
  isActive: boolean;
  terms?: string[];
}

export interface ProductSpecifications {
  [key: string]: string | number | boolean | string[] | undefined;
  color?: string;
  size?: string;
  material?: string;
  style?: string;
  pattern?: string;
  careInstructions?: string;
  countryOfOrigin?: string;
  warranty?: string;
  modelNumber?: string;
  partNumber?: string;
  asin?: string;
  upc?: string;
  ean?: string;
  isbn?: string;
  releaseDate?: string;
  language?: string;
  edition?: string;
  format?: string;
  pages?: number;
  author?: string;
  illustrator?: string;
  publisher?: string;
  publicationDate?: string;
}

export interface Dimensions {
  length: number;
  width: number;
  height: number;
  unit: 'mm' | 'cm' | 'm' | 'in' | 'ft';
}

export interface Weight {
  value: number;
  unit: 'g' | 'kg' | 'oz' | 'lb';
}

export interface Address {
  street: string;
  street2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone?: string;
  email?: string;
  name?: string;
}

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface SEOInfo {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  structuredData?: Record<string, unknown>;
}

export enum ProductStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  OUT_OF_STOCK = 'out_of_stock',
  DISCONTINUED = 'discontinued',
  ARCHIVED = 'archived',
  UNDER_REVIEW = 'under_review',
}

export enum ProductCondition {
  NEW = 'new',
  USED_LIKE_NEW = 'used_like_new',
  USED_GOOD = 'used_good',
  USED_FAIR = 'used_fair',
  REFURBISHED = 'refurbished',
  OPEN_BOX = 'open_box',
  FOR_PARTS = 'for_parts',
}

export enum ProductAvailability {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
  PRE_ORDER = 'pre_order',
  BACKORDER = 'backorder',
  DISCONTINUED = 'discontinued',
}

export enum ProductSort {
  PRICE_LOW_TO_HIGH = 'price_low_to_high',
  PRICE_HIGH_TO_LOW = 'price_high_to_low',
  NEWEST = 'newest',
  OLDEST = 'oldest',
  BEST_SELLING = 'best_selling',
  TOP_RATED = 'top_rated',
  MOST_VIEWED = 'most_viewed',
  RELEVANCE = 'relevance',
}

export enum ProductView {
  GRID = 'grid',
  LIST = 'list',
  COMPACT = 'compact',
}

export interface ProductFilters {
  // Pagination
  page?: number;
  limit?: number;
  offset?: number;
  
  sort?: ProductSort | string;
  sortBy?: ProductSort | string;
  order?: 'asc' | 'desc';

  category?: string | string[];
  categoryId?: string;
  subcategory?: string | string[];
  brand?: string | string[];
  seller?: string | string[];
  
  minPrice?: number;
  maxPrice?: number;
  onSale?: boolean;
  
  inStock?: boolean;
  backorderAvailable?: boolean;
  availability?: ProductAvailability[];
  
  rating?: number;
  minRating?: number;
  
  freeShipping?: boolean;
  prime?: boolean;
  internationalShipping?: boolean;
  
  condition?: ProductCondition[];
  color?: string[];
  size?: string[];
  material?: string[];
  
  bestSeller?: boolean;
  newArrival?: boolean;
  featured?: boolean;
  flashSale?: boolean;
  
  query?: string;
  search?: string;
  q?: string;
  
  dateFrom?: string;
  dateTo?: string;
  
  tags?: string[];
  excludeIds?: string[];
  includeIds?: string[];
}

export interface ProductListResponse {
  data: Product[];
  pagination: PaginationInfo;
  filters?: ProductFilters;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductSearchResponse {
  data: Product[];
  pagination: PaginationInfo;
  facets?: SearchFacets;
  suggestions?: string[];
  relatedSearches?: string[];
}

export interface SearchFacets {
  categories: FacetCategory[];
  brands: FacetBrand[];
  priceRanges: PriceRange[];
  ratings: FacetRating[];
  availability: FacetAvailability[];
  colors: FacetColor[];
  sizes: FacetSize[];
  materials: FacetMaterial[];
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextPage?: number;
  prevPage?: number;
}

export interface FacetCategory {
  id: string;
  name: string;
  count: number;
  slug: string;
  children?: FacetCategory[];
}

export interface FacetBrand {
  id: string;
  name: string;
  count: number;
  logo?: string;
}

export interface FacetRating {
  rating: number;
  count: number;
}

export interface FacetAvailability {
  status: ProductAvailability;
  count: number;
}

export interface FacetColor {
  color: string;
  hex: string;
  count: number;
}

export interface FacetSize {
  size: string;
  count: number;
}

export interface FacetMaterial {
  material: string;
  count: number;
}

export interface PriceRange {
  min: number;
  max: number;
  label: string;
  count: number;
}

export interface ProductFormData {
  name: string;
  description: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number;
  currency?: string;
  categoryId: string;
  subcategoryId?: string;
  brandId?: string;
  images: File[];
  existingImages?: string[];
  videoUrls?: string[];
  stockQuantity: number;
  inStock: boolean;
  allowBackorder?: boolean;
  condition?: ProductCondition;
  tags?: string[];
  specifications?: Record<string, string>;
  features?: string[];
  dimensions?: Dimensions;
  weight?: Weight;
  shipping?: ShippingInfo;
  delivery?: DeliveryInfo;
  warranty?: string;
  returnPolicy?: string;
  status: ProductStatus;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  seo?: SEOInfo;
  badges?: Partial<ProductBadges>;
  flashSale?: Omit<FlashSale, 'isActive' | 'remainingTime' | 'soldCount'>;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  title?: string;
  content: string;
  images?: string[];
  videos?: string[];
  verifiedPurchase: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  isHelpful?: boolean;
  createdAt: string;
  updatedAt: string;
  replies?: ProductReviewReply[];
}

export interface CreateReviewPayload {
  rating: number;
  title?: string;
  content: string;
  images?: string[];
  videos?: string[];
}

export interface ProductReviewReply {
  id: string;
  reviewId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  isSellerResponse: boolean;
  createdAt: string;
}

export interface ProductQuestion {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  question: string;
  answers: ProductAnswer[];
  voteCount: number;
  createdAt: string;
}

export interface ProductAnswer {
  id: string;
  questionId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  answer: string;
  isSellerResponse: boolean;
  voteCount: number;
  createdAt: string;
}

export interface ProductComparison {
  products: Product[];
  attributes: ComparisonAttribute[];
}

export interface ComparisonAttribute {
  name: string;
  values: {
    productId: string;
    value: string | number | boolean | null;
  }[];
}

export interface ProductPriceHistory {
  productId: string;
  history: PricePoint[];
  averagePrice: number;
  highestPrice: number;
  lowestPrice: number;
  priceChange: number;
}

export interface PricePoint {
  price: number;
  date: string;
  source: 'site' | 'competitor';
  competitor?: string;
}

export interface ProductImportData {
  products: Partial<Product>[];
  action: 'create' | 'update' | 'merge';
  onDuplicate: 'skip' | 'update' | 'create_new';
  validationMode: 'strict' | 'lenient';
}

export interface ProductExportOptions {
  format: 'csv' | 'json' | 'xml';
  filters?: ProductFilters;
  fields?: string[];
  includeImages?: boolean;
  includeSpecifications?: boolean;
  includeReviews?: boolean;
}

export type ProductId = string;
export type ProductSlug = string;
export type ProductSku = string;

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, string>;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  inStock: boolean;
  images?: string[];
}

export interface ProductBundle {
  id: string;
  name: string;
  description?: string;
  products: {
    productId: string;
    quantity: number;
  }[];
  price: number;
  compareAtPrice?: number;
  discount: number;
  image?: string;
}

export interface ProductWishlist {
  id: string;
  userId: string;
  productId: string;
  addedAt: string;
}

export const createMockProduct = (overrides?: Partial<Product>): Product => ({
  id: `prod_${Math.random().toString(36).substr(2, 9)}`,
  name: 'Sample Product',
  slug: 'sample-product',
  description: 'This is a sample product description.',
  shortDescription: 'Sample short description.',
  price: 99.99,
  compareAtPrice: 149.99,
  currency: 'KES',
  imageUrls: ['/sample-image.jpg'],
  images: [],
  inStock: true,
  stockQuantity: 50,
  averageRating: 4.5,
  reviewCount: 120,
  ratingDistribution: { 1: 5, 2: 8, 3: 12, 4: 30, 5: 65 },
  status: ProductStatus.ACTIVE,
  isActive: true,
  isFeatured: false,
  isBestSeller: true,
  isNew: false,
  soldCount: 500,
  views: 15000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});


export const validateProduct = (product: Partial<Product>): string[] => {
  const errors: string[] = [];

  if (!product.name?.trim()) {
    errors.push('Product name is required');
  }

  if (!product.price || product.price <= 0) {
    errors.push('Product price must be greater than 0');
  }

  if (product.compareAtPrice && product.compareAtPrice <= product.price!) {
    errors.push('Compare at price must be greater than the regular price');
  }

  if (product.description && product.description.length < 50) {
    errors.push('Description should be at least 50 characters');
  }

  if (!product.category) {
    errors.push('Category is required');
  }

  if (product.stockQuantity !== undefined && product.stockQuantity < 0) {
    errors.push('Stock quantity cannot be negative');
  }

  return errors;
};

export const isProductOnSale = (product: Product): boolean => {
  return !!(
    product.compareAtPrice &&
    product.compareAtPrice > product.price
  );
};

export const calculateProductDiscount = (product: Product): number => {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) {
    return 0;
  }
  return Math.round(
    ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100
  );
};

export const isProductInStock = (product: Product): boolean => {
  return product.inStock && (product.stockQuantity || 0) > 0;
};

export const getProductStockStatus = (product: Product): string => {
  if (!product.inStock || !product.stockQuantity || product.stockQuantity <= 0) {
    return 'Out of Stock';
  }
  if (product.stockQuantity <= 3) {
    return `Only ${product.stockQuantity} left - Order soon!`;
  }
  if (product.stockQuantity <= 10) {
    return `Only ${product.stockQuantity} left in stock`;
  }
  return 'In Stock';
};

export const getProductRatingPercentage = (product: Product): number => {
  if (product.averageRating === 0 || product.reviewCount === 0) {
    return 0;
  }
  return (product.averageRating / 5) * 100;
};

