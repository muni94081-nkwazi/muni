-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'BUDGET_EXHAUSTED');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "daily_budget_ugx" DECIMAL(14,2) NOT NULL,
    "bid_per_click_ugx" DECIMAL(14,2) NOT NULL,
    "keywords" TEXT[],
    "status" "CampaignStatus" NOT NULL,
    "total_impressions" INTEGER NOT NULL DEFAULT 0,
    "total_clicks" INTEGER NOT NULL DEFAULT 0,
    "total_spent_ugx" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_clicks" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "charged_amount_ugx" DECIMAL(14,2) NOT NULL,
    "user_ip" TEXT,
    "clicked_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_seller_id_idx" ON "campaigns"("seller_id");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "ad_clicks_campaign_id_clicked_at_idx" ON "ad_clicks"("campaign_id", "clicked_at");

-- CreateIndex
CREATE INDEX "ad_clicks_seller_id_idx" ON "ad_clicks"("seller_id");

-- AddForeignKey
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

