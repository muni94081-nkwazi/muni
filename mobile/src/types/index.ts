/**
 * MUNI Mobile App — Shared TypeScript types
 * Used across screens, store, and API layer
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id:                 string;
  firstName:          string;
  lastName:           string;
  email:              string;
  phoneNumber:        string | null;
  profilePictureUrl:  string | null;
  roles:              UserRole[];
  emailVerified:      boolean;
  createdAt:          string;
}

export type UserRole = 'ROLE_CUSTOMER' | 'ROLE_SELLER' | 'ROLE_ADMIN';

export interface AuthTokens {
  accessToken:  string;
  refreshToken: string;
}

// ── Products ──────────────────────────────────────────────────────────────────

/**
 * A product, exactly as product-service's `formatProduct` returns it.
 *
 * Five of the field names this used to declare do not exist on the wire, and
 * because the API layer passes the response straight through, every one of them
 * was `undefined` at runtime:
 *
 *   images        → the server sends `imageUrls`. No product image has ever
 *                   rendered on mobile; every card and gallery fell back.
 *   rating        → `averageRating`. RatingStars received undefined.
 *   stock         → `stockQuantity`. `product.stock <= 0` was
 *                   `undefined <= 0` → false, so nothing ever showed as sold
 *                   out on a card.
 *   originalPrice → `compareAtPrice`. No sale price or discount badge.
 *   sellerName    → does not exist at all. product-service stores only
 *                   `sellerId`; the shop name lives in marketplace-service and
 *                   is fetched separately (see src/api/storefront.api.ts).
 *
 * Nothing failed loudly because they were all optional-by-accident reads.
 */
export interface Product {
  id:              string;
  name:            string;
  slug?:           string;
  description:     string;
  sku?:            string;
  price:           number;
  /** The was-price, when the seller set one. Null when there is no discount. */
  compareAtPrice?: number | null;
  currency:        string;
  /** Product images, falling back server-side to the first variant's. */
  imageUrls:       string[];
  /** Full category object, not a name string. */
  category?:       { id: string; name: string; slug: string } | null;
  categoryId?:     string;
  brand?:          { id: string; name: string; slug: string } | null;
  /**
   * The owning seller's user id. The only seller field the catalogue carries —
   * resolve it through marketplace-service for anything a shopper reads.
   */
  sellerId:        string;
  averageRating:   number;
  reviewCount:     number;
  /** Sum of `stock − reserved` across variants: what can actually be bought. */
  stockQuantity:   number;
  inStock:         boolean;
  lowStock?:       boolean;
  variants?:       Variant[];
  tags:            string[];
  status?:         string;
  createdAt?:      string;
}

/**
 * One purchasable SKU, exactly as product-service returns it.
 *
 * This type described a variant that does not exist. It had `type`, `label`,
 * `value` and `priceModifier` — none of which product-service sends. The server
 * returns `attributes` (a `{ color: 'Red', size: 'M' }` map), an absolute
 * `price`, and `stock`/`reserved` as separate numbers.
 *
 * Nothing failed loudly, because the fields were simply `undefined` at runtime:
 * every variant chip rendered an empty label, and `price + priceModifier`
 * became `price + undefined` → NaN the moment a variant was selected.
 *
 * `stock` here is PHYSICAL stock. Use `availableStock` for anything a shopper
 * sees — the difference is units already held by other people's carts.
 */
export interface Variant {
  id:         string;
  sku:        string;
  /** e.g. `{ color: 'Red', size: 'M' }`. Empty for a single-SKU product. */
  attributes: Record<string, string>;
  /** Absolute price for this SKU, not a delta on the product's price. */
  price:      number;
  compareAtPrice?: number | null;
  /** Physical units on the shelf, including those reserved by open carts. */
  stock:      number;
  /** Units held by carts mid-checkout. */
  reserved:   number;
  /** stock − reserved. What can actually be bought right now. */
  availableStock: number;
  images?:    string[];
}

/**
 * A human label for a variant chip, built from its attribute map.
 *
 * `{ color: 'Red', size: 'M' }` → "Red · M". A single-SKU product has no
 * attributes, so it falls back to the SKU rather than rendering blank.
 */
export function variantLabel(variant: Variant): string {
  const values = Object.values(variant.attributes ?? {}).filter(Boolean);
  return values.length > 0 ? values.join(' · ') : variant.sku;
}

/**
 * A department, exactly as product-service's `GET /api/v1/categories` returns
 * it — that route is `categoryController.getTree`, a recursive CTE that emits
 * root categories each carrying their nested `children`.
 *
 * `children`, `parentId`, `level`, `path` and `description` were previously
 * absent from this type, so the app parsed the tree and threw the hierarchy
 * away, leaving every department to look like a leaf.
 *
 * `icon` and `count` are the exception: the service sends neither, so both are
 * always undefined today. They are kept because CategoryCard falls back
 * gracefully, but nothing should be built on the assumption they arrive.
 */
export interface Category {
  id:       string;
  name:     string;
  slug:     string;
  icon?:    string;
  imageUrl?: string;
  count?:   number;
  description?: string | null;
  parentId?: string | null;
  /** 0 for a root department, 1 for its children, and so on. */
  level?:   number;
  /** Slash-joined slugs from the root, e.g. "electronics/phones". */
  path?:    string;
  children?: Category[];
}

// ── Cart ──────────────────────────────────────────────────────────────────────

/**
 * One line in the cart, exactly as cart-service stores and returns it
 * (CartItemSchema in cart-service/src/models/cart.model.ts).
 *
 * `id` is the LINE id and is what PATCH/DELETE /cart/items/:itemId address —
 * not productId. The same product in two variants is two lines with two ids,
 * which is why keying by productId silently updated the wrong one.
 *
 * The field names follow the service (`productName`, `productImage`,
 * `maxQuantity`) rather than the friendlier `name`/`imageUrl`/`maxStock` this
 * type used to declare; those never matched anything the API sent, so every
 * one of them read as undefined at runtime.
 */
export interface CartItem {
  id:            string;
  productId:     string;
  sellerId:      string;
  productName:   string;
  productImage:  string;
  variantId?:    string;
  variantLabel?: string;
  price:         number;
  quantity:      number;
  maxQuantity:   number;
  weight?:       number;
  addedAt:       string;
}

export interface CartSummary {
  subtotal:  number;
  discount:  number;
  tax:       number;
  shipping:  number;
  total:     number;
  currency:  string;
}

export interface Coupon {
  code:        string;
  type:        'percentage' | 'fixed';
  value:       number;
  description: string;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface Order {
  id:               string;
  orderNumber:      string;
  status:           OrderStatus;
  items:            OrderItem[];
  shippingAddress:  Address;
  paymentMethod:    string;
  subtotal:         number;
  tax:              number;
  shipping:         number;
  discount:         number;
  total:            number;
  currency:         string;
  estimatedDelivery?: string;
  trackingNumber?:  string;
  createdAt:        string;
  updatedAt:        string;
}

export interface OrderItem {
  productId:   string;
  name:        string;
  imageUrl:    string;
  price:       number;
  quantity:    number;
  variantLabel?: string;
}

// ── Address ───────────────────────────────────────────────────────────────────

export interface Address {
  id?:        string;
  fullName:   string;
  phone:      string;
  street:     string;
  city:       string;
  district:   string;
  country:    string;
  postalCode?: string;
  isDefault?: boolean;
}

// ── Checkout ──────────────────────────────────────────────────────────────────

/**
 * Payment methods payment-service actually accepts.
 *
 * Mirrors `PaymentMethodSchema` in
 * payment-service/src/models/validation.schemas.ts. The previous list had
 * 'mobile_money' and 'bank_transfer', neither of which is a member — and
 * 'mobile_money' was the primary rail, so the common path was the broken one.
 * Mobile money is named per-network ('mtn_momo' / 'airtel_money'), which is why
 * there is no separate provider field any more.
 */
export type PaymentMethodType =
  | 'mtn_momo'
  | 'airtel_money'
  | 'card'
  | 'visa_card'
  | 'flutterwave'
  | 'pesapal'
  | 'cod';

export type CardBrand = 'VISA' | 'MASTERCARD';

/** 3DS2 authentication state, mirrored from payment-service's `ThreeDSecureStatus`. */
export type ThreeDSecureStatus = 'CHALLENGE_REQUIRED' | 'AUTHENTICATED' | 'REJECTED';

export interface TokenizedCard {
  cardToken:    string;
  last4:        string;
  brand:        CardBrand;
  expiryMonth:  string;
  expiryYear:   string;
}

/**
 * The shipping block checkout-service reads, exactly as its saga destructures
 * it (`shippingFor()` in checkout.saga.ts): address, city, district, phone,
 * notes. It is NOT the address-book `Address` above — that is user-service's
 * shape, with contact names and geo fields the saga never looks at. Passing an
 * `Address` straight through would send `street` where the saga wants
 * `address`, which it tolerates, and omit `phone`, which it does not: the
 * mobile money prompt is sent to that number.
 */
export interface CheckoutShippingAddress {
  address:   string;
  city:      string;
  district?: string;
  phone:     string;
  notes?:    string;
}

/**
 * Body of POST /api/v1/checkout/initiate.
 *
 * Note what it does NOT carry: no cart id, no items, no prices, no totals.
 * checkout-service reads the cart by the authenticated identity and re-prices
 * every line against the catalogue, so the client has nothing to say about
 * cost. The old `CheckoutPayload` required a `cartId` the API has no field for
 * and cart-service never issues, plus a `deliveryMethod` that initiate does not
 * accept — shipping-service quotes from the address and items instead.
 */
export interface InitiateCheckoutPayload {
  shippingAddress: CheckoutShippingAddress;
  billingAddress?: CheckoutShippingAddress;
  paymentMethod: {
    type: PaymentMethodType;
    /** Gateway-tokenized card. Never a raw PAN/CVC. */
    token?: string;
    /**
     * Number the mobile money PIN prompt goes to. Separate from the shipping
     * phone on purpose — customers routinely pay from a different number than
     * the one the courier calls. Falls back to the shipping phone server-side.
     */
    phone?: string;
  };
}

export type CheckoutStatus =
  | 'INITIATED'
  | 'VALIDATING'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'ORDER_CREATED'
  | 'FAILED'
  | 'COMPLETED';

/** One saga step's outcome, for surfacing where a failed checkout stopped. */
export interface CheckoutStepRecord {
  step: string;
  status: 'pending' | 'completed' | 'failed';
  completedAt?: string;
  error?: string;
}

/**
 * What every checkout endpoint returns (`CheckoutSessionSchema` in
 * checkout-service). Replaces `CheckoutSummary`, which shared almost no fields
 * with it.
 *
 * Every money figure here is server-computed and display-only. `cartSnapshot`
 * is the priced basket the saga captured — typed loosely because the saga
 * writes its own priced line shape, not the cart-service `CartItem`.
 */
export interface CheckoutSession {
  id: string;
  userId: string;
  status: CheckoutStatus;
  /** Priced lines captured at PRICE_CART. Empty until the saga runs. */
  cartSnapshot: unknown[];
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  couponDiscount: number;
  total: number;
  couponCode?: string;
  /** Present once CREATE_ORDER succeeds — the handle the confirmation screen needs. */
  orderId?: string;
  paymentIntentId?: string;
  /** Why a FAILED session failed, in words safe to show the customer. */
  failureReason?: string;
  steps: CheckoutStepRecord[];
  createdAt: string;
  /** Sessions expire 15 minutes after creation. */
  expiresAt: string;
  updatedAt: string;
}

// ── Currency ──────────────────────────────────────────────────────────────────

export interface Currency {
  code:   string;
  name:   string;
  symbol: string;
  rate:   number;  // vs USD
}

// ── API Response ──────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success:   boolean;
  data:      T;
  error:     string | null;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  success:   boolean;
  data:      T[];
  total:     number;
  page:      number;
  limit:     number;
  hasMore:   boolean;
  error:     string | null;
  timestamp: string;
}

// ── Review ────────────────────────────────────────────────────────────────────

export interface Review {
  id:          string;
  userId:      string;
  userName:    string;
  userAvatar?: string;
  rating:      number;
  title:       string;
  body:        string;
  images?:     string[];
  helpful:     number;
  createdAt:   string;
}
