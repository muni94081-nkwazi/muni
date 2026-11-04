import { z } from 'zod';

export interface WishlistItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  addedAt: Date;
  priceAtAdd: number;
  currentPrice: number;
}

export interface Wishlist {
  id: string;
  userId: string;
  name: string;
  isPublic: boolean;
  items: WishlistItem[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Price Alert Models (Phase 15 Feature 2) ─────────────────────────────────

export interface PriceTracking {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  targetPrice: number;
  currency: string;
  currentPrice: number;
  lastCheckedAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface PriceHistoryPoint {
  id: string;
  productId: string;
  price: number;
  currency: string;
  timestamp: string;
}

// ─── Wishlist Sharing & Social Collaboration Models (Phase 15 Feature 3) ─────

export interface WishlistShare {
  id: string;
  wishlistId: string;
  shareToken: string;
  sharedWithUserId?: string;
  permission: 'view' | 'edit';
  createdAt: string;
  expiresAt?: string;
}

export interface WishlistCollaborator {
  id: string;
  wishlistId: string;
  userId: string;
  email?: string;
  permission: 'view' | 'edit';
  addedAt: string;
}

export interface WishlistActivity {
  id: string;
  wishlistId: string;
  userId: string;
  action: 'add_item' | 'remove_item' | 'share' | 'add_collaborator';
  timestamp: string;
}

export const createWishlistSchema = z.object({
  name: z.string().default('My Wishlist'),
  isPublic: z.boolean().default(false)
});

export const updateWishlistSchema = z.object({
  name: z.string().optional(),
  isPublic: z.boolean().optional()
});

export const addWishlistItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productImage: z.string(),
  price: z.number().min(0)
});
