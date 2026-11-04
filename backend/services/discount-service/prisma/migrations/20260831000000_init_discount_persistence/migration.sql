-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BOGO', 'FLASH_SALE');

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "min_order_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_usage_count" INTEGER NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "per_user_limit" INTEGER NOT NULL,
    "applicable_categories" TEXT[],
    "applicable_products" TEXT[],
    "applicable_sellers" TEXT[],
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expired_notified_at" TIMESTAMP(3),

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_redemptions" (
    "id" TEXT NOT NULL,
    "discount_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discounts_code_idx" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "discounts_active_starts_at_expires_at_idx" ON "discounts"("active", "starts_at", "expires_at");

-- CreateIndex
CREATE INDEX "discounts_type_active_idx" ON "discounts"("type", "active");

-- CreateIndex
CREATE INDEX "discounts_created_by_idx" ON "discounts"("created_by");

-- CreateIndex
CREATE INDEX "discount_redemptions_discount_id_user_id_idx" ON "discount_redemptions"("discount_id", "user_id");

-- CreateIndex
CREATE INDEX "discount_redemptions_user_id_idx" ON "discount_redemptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "discount_redemptions_discount_id_user_id_order_id_key" ON "discount_redemptions"("discount_id", "user_id", "order_id");

-- AddForeignKey
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── One active discount per code ─────────────────────────────────────────────
--
-- The service's rule is "a code must be unique among ACTIVE discounts" — a
-- retired code may deliberately be issued again. `create()` and `update()`
-- enforced that by scanning the in-process Map, which two replicas could not
-- do consistently: both would see no clash and both would insert.
--
-- Partial rather than a plain unique on `code`, precisely so deactivated codes
-- remain reusable. Prisma's schema language cannot express a WHERE clause on
-- an index, so this is written by hand — `prisma migrate diff` will not
-- reproduce it, and it must be carried forward if this migration is ever
-- regenerated.
CREATE UNIQUE INDEX "discounts_active_code_unique"
  ON "discounts" ("code")
  WHERE "active" = true;
