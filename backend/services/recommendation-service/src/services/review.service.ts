import { randomUUID } from 'node:crypto';
import type {
  ProductReview,
  SellerReview,
  ReviewStatus,
  FlagReason
} from '../models/review.model.js';
import { sellerReputationService } from './reputation.service.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';

const productReviewsMap = new Map<string, ProductReview>();
const sellerReviewsMap = new Map<string, SellerReview>();

// In-memory delivered orders index for verified purchase checks
const verifiedPurchases = new Set<string>(); // key: `userId:productId` or `userId:sellerId`

// Seed sample delivered purchase records for testing
verifiedPurchases.add('user-123:prod-001');
verifiedPurchases.add('user-123:seller-001');
verifiedPurchases.add('user-456:prod-002');
verifiedPurchases.add('user-456:seller-002');

// Prohibited terms for automated profanity & spam filtering
const PROFANITY_WORDS = ['scam', 'fraud', 'fake_site', 'cheat', 'crap', 'shit', 'bitch', 'idiot', 'spam_link'];

export interface CreateProductReviewInput {
  productId: string;
  sellerId?: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  body: string;
  userAccountCreatedAt?: string;
  userIp?: string;
}

export interface CreateSellerReviewInput {
  sellerId: string;
  userId: string;
  userName: string;
  communicationRating: number;
  shippingSpeedRating: number;
  itemAccuracyRating: number;
  overallRating: number;
  body: string;
  userAccountCreatedAt?: string;
}

export class ReviewService {
  /** Record delivered order to allow verified purchase reviews */
  recordDeliveredPurchase(userId: string, productId?: string, sellerId?: string) {
    if (productId) verifiedPurchases.add(`${userId}:${productId}`);
    if (sellerId) verifiedPurchases.add(`${userId}:${sellerId}`);
  }

  isVerifiedBuyer(userId: string, targetId: string): boolean {
    return verifiedPurchases.has(`${userId}:${targetId}`);
  }

  // ─── Automated Content Moderation & Profanity Check ───────────────────────

  private checkProfanity(text: string): boolean {
    const lower = text.toLowerCase();
    return PROFANITY_WORDS.some((word) => lower.includes(word));
  }

  // ─── Review Fraud & Velocity Anomaly Detection ──────────────────────────────

  private detectReviewFraud(
    targetId: string, // productId or sellerId
    rating: number,
    accountCreatedAt?: string
  ): { isSuspicious: boolean; reason?: FlagReason } {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    const accountAgeMs = accountCreatedAt ? now - new Date(accountCreatedAt).getTime() : SEVEN_DAYS + 1;
    const isNewAccount = accountAgeMs < SEVEN_DAYS;

    // Check recent product reviews for this target in last 1 hour
    const recentReviews = [...productReviewsMap.values()].filter((r) => {
      const isTarget = r.productId === targetId || r.sellerId === targetId;
      const isRecent = now - new Date(r.createdAt).getTime() < ONE_HOUR;
      return isTarget && isRecent;
    });

    // Rule 1: Fake Review Ring (>= 4 five-star reviews in 1 hour from new accounts)
    if (rating === 5 && isNewAccount) {
      const recentNewAccount5Stars = recentReviews.filter((r) => r.rating === 5 && r.userAccountCreatedAt && (now - new Date(r.userAccountCreatedAt).getTime() < SEVEN_DAYS));
      if (recentNewAccount5Stars.length >= 3) {
        return { isSuspicious: true, reason: 'suspicious_burst' };
      }
    }

    // Rule 2: Competitor Review Bombing (>= 4 one-star reviews in 1 hour)
    if (rating === 1) {
      const recent1Stars = recentReviews.filter((r) => r.rating === 1);
      if (recent1Stars.length >= 4) {
        return { isSuspicious: true, reason: 'competitor_sabotage' };
      }
    }

    return { isSuspicious: false };
  }

  // ─── Product Review Methods ───────────────────────────────────────────────

  async createProductReview(input: CreateProductReviewInput): Promise<ProductReview> {
    const isVerified = this.isVerifiedBuyer(input.userId, input.productId);
    if (!isVerified) {
      throw Object.assign(new Error('Only verified buyers who have received this product can leave a review.'), { status: 403 });
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    let status: ReviewStatus = 'approved';
    let flagReason: FlagReason | null = null;

    // 1. Check Profanity & Spam
    if (this.checkProfanity(input.title) || this.checkProfanity(input.body)) {
      status = 'flagged';
      flagReason = 'profanity';
    }

    // 2. Check Fraud Patterns
    if (status === 'approved') {
      const fraudCheck = this.detectReviewFraud(input.productId, input.rating, input.userAccountCreatedAt);
      if (fraudCheck.isSuspicious) {
        status = 'flagged';
        flagReason = fraudCheck.reason ?? 'suspicious_burst';
      }
    }

    const review: ProductReview = {
      id,
      productId:            input.productId,
      sellerId:             input.sellerId,
      userId:               input.userId,
      userName:             input.userName,
      rating:               input.rating,
      title:                input.title,
      body:                 input.body,
      verifiedPurchase:     true,
      helpful:              0,
      status,
      flagReason,
      sellerReply:          null,
      userAccountCreatedAt: input.userAccountCreatedAt,
      userIp:               input.userIp,
      createdAt:            now,
      updatedAt:            now,
    };

    productReviewsMap.set(id, review);

    // If flagged as suspicious, trigger fraud alert event via Kafka
    if (status === 'flagged') {
      void publish(
        Topics.REVIEW_EVENTS,
        {
          topic:       Topics.REVIEW_EVENTS,
          eventType:   'review.flagged_suspicious',
          reviewId:    id,
          productId:   input.productId,
          sellerId:    input.sellerId,
          reason:      flagReason,
          rating:      input.rating,
          flaggedAt:   now,
        },
        input.productId
      );
    }

    return review;
  }

  getProductReviews(productId: string, includeFlagged = false): ProductReview[] {
    return [...productReviewsMap.values()]
      .filter((r) => r.productId === productId && (includeFlagged || r.status === 'approved'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ─── Seller Review Methods ────────────────────────────────────────────────

  async createSellerReview(input: CreateSellerReviewInput): Promise<SellerReview> {
    const isVerified = this.isVerifiedBuyer(input.userId, input.sellerId);
    if (!isVerified) {
      throw Object.assign(new Error('Only verified buyers who have received orders from this seller can leave a review.'), { status: 403 });
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    let status: ReviewStatus = 'approved';
    let flagReason: FlagReason | null = null;

    if (this.checkProfanity(input.body)) {
      status = 'flagged';
      flagReason = 'profanity';
    }

    const review: SellerReview = {
      id,
      sellerId:             input.sellerId,
      userId:               input.userId,
      userName:             input.userName,
      communicationRating: input.communicationRating,
      shippingSpeedRating: input.shippingSpeedRating,
      itemAccuracyRating:  input.itemAccuracyRating,
      overallRating:        input.overallRating,
      body:                 input.body,
      verifiedPurchase:     true,
      status,
      flagReason,
      sellerReply:          null,
      userAccountCreatedAt: input.userAccountCreatedAt,
      createdAt:            now,
      updatedAt:            now,
    };

    sellerReviewsMap.set(id, review);

    // Recalculate seller aggregate reputation
    this.recalculateSellerReputation(input.sellerId);

    return review;
  }

  getSellerReviews(sellerId: string, includeFlagged = false): SellerReview[] {
    return [...sellerReviewsMap.values()]
      .filter((r) => r.sellerId === sellerId && (includeFlagged || r.status === 'approved'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ─── Admin Moderation & Seller Replies ────────────────────────────────────

  getFlaggedReviews(): { productReviews: ProductReview[]; sellerReviews: SellerReview[] } {
    const productReviews = [...productReviewsMap.values()].filter((r) => r.status === 'flagged');
    const sellerReviews = [...sellerReviewsMap.values()].filter((r) => r.status === 'flagged');
    return { productReviews, sellerReviews };
  }

  moderateReview(reviewId: string, action: 'approve' | 'reject'): ProductReview | SellerReview {
    const now = new Date().toISOString();
    
    if (productReviewsMap.has(reviewId)) {
      const review = productReviewsMap.get(reviewId)!;
      review.status = action === 'approve' ? 'approved' : 'rejected';
      review.updatedAt = now;
      return review;
    }

    if (sellerReviewsMap.has(reviewId)) {
      const review = sellerReviewsMap.get(reviewId)!;
      review.status = action === 'approve' ? 'approved' : 'rejected';
      review.updatedAt = now;
      if (action === 'approve') this.recalculateSellerReputation(review.sellerId);
      return review;
    }

    throw Object.assign(new Error('Review not found'), { status: 404 });
  }

  addSellerReply(reviewId: string, sellerId: string, replyBody: string): ProductReview | SellerReview {
    const now = new Date().toISOString();

    const productRev = productReviewsMap.get(reviewId);
    if (productRev) {
      productRev.sellerReply = { replyBody, repliedAt: now };
      productRev.updatedAt = now;
      return productRev;
    }

    const sellerRev = sellerReviewsMap.get(reviewId);
    if (sellerRev) {
      if (sellerRev.sellerId !== sellerId) {
        throw Object.assign(new Error('Unauthorized to reply to this review'), { status: 403 });
      }
      sellerRev.sellerReply = { replyBody, repliedAt: now };
      sellerRev.updatedAt = now;
      return sellerRev;
    }

    throw Object.assign(new Error('Review not found'), { status: 404 });
  }

  private recalculateSellerReputation(sellerId: string) {
    const approvedReviews = this.getSellerReviews(sellerId, false);
    if (approvedReviews.length === 0) return;

    const avgRating = approvedReviews.reduce((sum, r) => sum + r.overallRating, 0) / approvedReviews.length;
    sellerReputationService.calculateReputation({
      sellerId,
      averageRating6Mo: avgRating,
      totalReviewsCount: approvedReviews.length,
    });
  }
}

export const reviewService = new ReviewService();
