-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ORDERED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "sellerId" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "subOrderId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "sellerResponse" TEXT,
    "sellerRespondedAt" TIMESTAMP(3),
    "moderatedBy" TEXT,
    "moderationNote" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_media" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_votes" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" "VoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "orderId" TEXT NOT NULL,
    "subOrderId" TEXT,
    "sellerId" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ORDERED',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_rating_summaries" (
    "productId" TEXT NOT NULL,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "count1" INTEGER NOT NULL DEFAULT 0,
    "count2" INTEGER NOT NULL DEFAULT 0,
    "count3" INTEGER NOT NULL DEFAULT 0,
    "count4" INTEGER NOT NULL DEFAULT 0,
    "count5" INTEGER NOT NULL DEFAULT 0,
    "verifiedReviews" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_rating_summaries_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE INDEX "reviews_productId_status_createdAt_idx" ON "reviews"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_productId_status_helpfulCount_idx" ON "reviews"("productId", "status", "helpfulCount");

-- CreateIndex
CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

-- CreateIndex
CREATE INDEX "reviews_sellerId_status_idx" ON "reviews"("sellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_userId_productId_orderId_key" ON "reviews"("userId", "productId", "orderId");

-- CreateIndex
CREATE INDEX "review_media_reviewId_idx" ON "review_media"("reviewId");

-- CreateIndex
CREATE INDEX "review_media_status_idx" ON "review_media"("status");

-- CreateIndex
CREATE INDEX "review_votes_reviewId_idx" ON "review_votes"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "review_votes_reviewId_userId_key" ON "review_votes"("reviewId", "userId");

-- CreateIndex
CREATE INDEX "review_reports_status_idx" ON "review_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "review_reports_reviewId_reporterId_key" ON "review_reports"("reviewId", "reporterId");

-- CreateIndex
CREATE INDEX "purchase_records_userId_productId_status_idx" ON "purchase_records"("userId", "productId", "status");

-- CreateIndex
CREATE INDEX "purchase_records_orderId_idx" ON "purchase_records"("orderId");

-- CreateIndex
CREATE INDEX "purchase_records_orderId_sellerId_idx" ON "purchase_records"("orderId", "sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_records_userId_productId_orderId_key" ON "purchase_records"("userId", "productId", "orderId");

-- AddForeignKey
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
