-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'SELLER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('HOME', 'WORK', 'PICKUP_STATION');

-- CreateEnum
CREATE TYPE "SellerStanding" AS ENUM ('GOOD', 'AT_RISK', 'SUSPENDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'HOME',
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'UG',
    "region" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "ward" TEXT,
    "addressLine" TEXT NOT NULL,
    "landmark" TEXT,
    "postalCode" TEXT,
    "pickupStationId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionalSms" BOOLEAN NOT NULL DEFAULT true,
    "transactionalEmail" BOOLEAN NOT NULL DEFAULT true,
    "transactionalPush" BOOLEAN NOT NULL DEFAULT true,
    "marketingSms" BOOLEAN NOT NULL DEFAULT false,
    "marketingEmail" BOOLEAN NOT NULL DEFAULT true,
    "marketingPush" BOOLEAN NOT NULL DEFAULT false,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Kampala',
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_trust_stats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "onTimeDeliveries" INTEGER NOT NULL DEFAULT 0,
    "lateDeliveries" INTEGER NOT NULL DEFAULT 0,
    "disputesOpened" INTEGER NOT NULL DEFAULT 0,
    "disputesResolvedSellerFavor" INTEGER NOT NULL DEFAULT 0,
    "disputesResolvedBuyerFavor" INTEGER NOT NULL DEFAULT 0,
    "defectReportsINAD" INTEGER NOT NULL DEFAULT 0,
    "slaBreaches" INTEGER NOT NULL DEFAULT 0,
    "lateShipments" INTEGER NOT NULL DEFAULT 0,
    "cancelledBySeller" INTEGER NOT NULL DEFAULT 0,
    "ordersAccepted" INTEGER NOT NULL DEFAULT 0,
    "claimsGranted" INTEGER NOT NULL DEFAULT 0,
    "policyViolations" INTEGER NOT NULL DEFAULT 0,
    "totalResponseHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resolvedResponseCount" INTEGER NOT NULL DEFAULT 0,
    "isVerifiedMerchant" BOOLEAN NOT NULL DEFAULT false,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "standing" "SellerStanding" NOT NULL DEFAULT 'GOOD',
    "standingReason" TEXT,
    "standingChangedAt" TIMESTAMP(3),
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_trust_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- CreateIndex
CREATE INDEX "addresses_userId_deletedAt_idx" ON "addresses"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_trust_stats_userId_key" ON "seller_trust_stats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_trust_stats" ADD CONSTRAINT "seller_trust_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
