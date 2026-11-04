-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('MATCH', 'BEAT_BY', 'PERCENTAGE');

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "rule_type" "PricingRuleType" NOT NULL,
    "target_price" DECIMAL(14,2) NOT NULL,
    "min_price_floor" DECIMAL(14,2) NOT NULL,
    "current_price" DECIMAL(14,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_prices" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "competitor_name" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "scraped_at" TEXT NOT NULL,

    CONSTRAINT "competitor_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_histories" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "old_price" DECIMAL(14,2) NOT NULL,
    "new_price" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_at" TEXT NOT NULL,

    CONSTRAINT "price_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_rules_seller_id_idx" ON "pricing_rules"("seller_id");

-- CreateIndex
CREATE INDEX "pricing_rules_is_active_idx" ON "pricing_rules"("is_active");

-- CreateIndex
CREATE INDEX "pricing_rules_product_id_idx" ON "pricing_rules"("product_id");

-- CreateIndex
CREATE INDEX "competitor_prices_product_id_idx" ON "competitor_prices"("product_id");

-- CreateIndex
CREATE INDEX "price_histories_product_id_changed_at_idx" ON "price_histories"("product_id", "changed_at");

