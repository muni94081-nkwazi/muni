import { randomUUID } from 'node:crypto';
import type { Review } from '../models/review.model.js';
import { products } from './product.service.js';

const reviews = new Map<string, Review>();

export function add(productId: string, userId: string, userName: string, rating: number, title: string, body: string) {
  const review: Review = {
    id: randomUUID(),
    productId,
    userId,
    userName,
    rating,
    title,
    body,
    verifiedPurchase: true,
    helpful: 0,
    createdAt: new Date().toISOString()
  };
  reviews.set(review.id, review);
  recalculateProductRating(productId);
  return review;
}

export function list(productId: string, page = 0, size = 10) {
  const productReviews = [...reviews.values()].filter(r => r.productId === productId);
  return {
    data: productReviews.slice(page * size, (page + 1) * size),
    meta: {
      current_page: page,
      last_page: Math.max(0, Math.ceil(productReviews.length / size) - 1),
      per_page: size,
      total: productReviews.length
    }
  };
}

function recalculateProductRating(productId: string) {
  const productReviews = [...reviews.values()].filter(r => r.productId === productId);
  const count = productReviews.length;
  const average = count === 0 ? 0 : productReviews.reduce((sum, r) => sum + r.rating, 0) / count;
  
  const product = products.find(p => p.id === productId);
  if (product) {
    product.averageRating = average;
    product.reviewCount = count;
  }
}
