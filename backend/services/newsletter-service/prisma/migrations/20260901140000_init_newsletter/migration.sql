-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('FOOTER', 'CHECKOUT', 'ACCOUNT', 'IMPORT');

-- CreateTable
CREATE TABLE "newsletter_subscriptions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "source" "SubscriptionSource" NOT NULL DEFAULT 'FOOTER',
    "user_id" TEXT,
    "market" TEXT NOT NULL DEFAULT 'UG',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "consent_at" TIMESTAMP(3),
    "consent_ip" TEXT,
    "consent_user_agent" TEXT,
    "consent_version" TEXT NOT NULL DEFAULT 'footer-v1',
    "unsubscribe_token" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_email_key" ON "newsletter_subscriptions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_unsubscribe_token_key" ON "newsletter_subscriptions"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "newsletter_subscriptions_status_market_idx" ON "newsletter_subscriptions"("status", "market");
