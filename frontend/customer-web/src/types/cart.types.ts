export interface CartItem {
  id: string;
  productId: string;
  vendorId: string;
  productName: string;
  productSku: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isAvailable: boolean;
  stockSnapshot: number | null;
  exceedsAvailableStock: boolean;
}

export interface Cart {
  id: string;
  userId: string | null;
  sessionId: string | null;
  currency: string;
  couponCode: string | null;
  discountAmount: number;
  subtotal: number;
  total: number;
  status: string;
  itemCount: number;
  totalUnits: number;
  hasUnavailableItems: boolean;
  items: CartItem[];
  expiresAt: string | null;
  lastActivityAt: string | null;
}

export interface AddCartItemPayload {
  productId: string;
  sellerId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
  maxQuantity: number;
  variantId?: string;
  variantLabel?: string;
  weight?: number;
}

export interface UpdateCartItemPayload {
  quantity: number;
}
