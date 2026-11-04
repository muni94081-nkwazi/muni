-- CreateEnum
CREATE TYPE "ClaimReason" AS ENUM ('ITEM_NOT_RECEIVED', 'NOT_AS_DESCRIBED', 'COUNTERFEIT', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('FILED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EscrowHoldStatus" AS ENUM ('HELD', 'DISPUTE_HELD', 'RELEASED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReleaseTrigger" AS ENUM ('BUYER_CONFIRMED', 'AUTO_7_DAY', 'ADMIN_OVERRIDE', 'DISPUTE_RESOLVED_SELLER_FAVOR');

-- CreateEnum
CREATE TYPE "RefundTrigger" AS ENUM ('DISPUTE_RESOLVED_BUYER_FAVOR', 'ADMIN_OVERRIDE');

-- CreateTable
CREATE TABLE "protection_claims" (
    "id" TEXT NOT NULL,
    "claim_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "reason" "ClaimReason" NOT NULL,
    "claim_amount_ugx" DECIMAL(14,2) NOT NULL,
    "status" "ClaimStatus" NOT NULL,
    "admin_notes" TEXT,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "protection_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_holds" (
    "id" TEXT NOT NULL,
    "hold_key" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sub_order_id" TEXT,
    "buyer_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "EscrowHoldStatus" NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "auto_release_at" TIMESTAMP(3),
    "expected_delivery_at" TIMESTAMP(3),
    "active_dispute_id" TEXT,
    "released_at" TIMESTAMP(3),
    "release_trigger" "ReleaseTrigger",
    "refunded_at" TIMESTAMP(3),
    "refund_trigger" "RefundTrigger",
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protection_claims_claim_number_key" ON "protection_claims"("claim_number");

-- CreateIndex
CREATE INDEX "protection_claims_user_id_created_at_idx" ON "protection_claims"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "protection_claims_status_idx" ON "protection_claims"("status");

-- CreateIndex
CREATE INDEX "protection_claims_order_id_idx" ON "protection_claims"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_holds_hold_key_key" ON "escrow_holds"("hold_key");

-- CreateIndex
CREATE INDEX "escrow_holds_seller_id_idx" ON "escrow_holds"("seller_id");

-- CreateIndex
CREATE INDEX "escrow_holds_status_auto_release_at_idx" ON "escrow_holds"("status", "auto_release_at");

-- CreateIndex
CREATE INDEX "escrow_holds_order_id_idx" ON "escrow_holds"("order_id");

