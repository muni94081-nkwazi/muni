-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARNED', 'REDEEMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LoyaltySource" AS ENUM ('PURCHASE', 'REVIEW', 'REFERRAL', 'BIRTHDAY');

-- CreateEnum
CREATE TYPE "LoyaltyRewardType" AS ENUM ('DISCOUNT', 'FREE_SHIPPING', 'PRODUCT');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "loyalty_users" (
    "user_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "tier" "LoyaltyTier" NOT NULL,
    "tier_progress" INTEGER NOT NULL,
    "lifetime_points" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "source" "LoyaltySource" NOT NULL,
    "reference_id" TEXT,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_rewards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points_cost" INTEGER NOT NULL,
    "type" "LoyaltyRewardType" NOT NULL,
    "value" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_redemptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "reward_name" TEXT NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_referrals" (
    "referral_code" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referee_id" TEXT,
    "status" "ReferralStatus" NOT NULL,
    "reward_points" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_referrals_pkey" PRIMARY KEY ("referral_code")
);

-- CreateIndex
CREATE INDEX "loyalty_transactions_user_id_created_at_idx" ON "loyalty_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_rewards_is_active_idx" ON "loyalty_rewards"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_redemptions_code_key" ON "loyalty_redemptions"("code");

-- CreateIndex
CREATE INDEX "loyalty_redemptions_user_id_redeemed_at_idx" ON "loyalty_redemptions"("user_id", "redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_referrals_id_key" ON "loyalty_referrals"("id");

-- CreateIndex
CREATE INDEX "loyalty_referrals_referrer_id_idx" ON "loyalty_referrals"("referrer_id");


-- ── Starter reward catalogue ─────────────────────────────────────────────────
-- These two rewards were hardcoded into rewardsStore at module load, so they
-- existed the moment the service booted. Seeded here so a fresh database
-- behaves the same, while leaving them editable rows rather than constants.
INSERT INTO "loyalty_rewards" ("id", "name", "description", "points_cost", "type", "value", "is_active")
VALUES
  ('rw-1', '5,000 UGX Off Checkout Coupon', 'Redeem 500 points for 5,000 UGX instant discount', 500, 'DISCOUNT', 5000, true),
  ('rw-2', 'Free Standard Delivery (Nationwide)', 'Redeem 750 points for free shipping on any order', 750, 'FREE_SHIPPING', 15000, true)
ON CONFLICT ("id") DO NOTHING;
