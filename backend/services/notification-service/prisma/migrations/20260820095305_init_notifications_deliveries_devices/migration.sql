-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('IN_APP', 'SMS', 'WHATSAPP', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" "Category" NOT NULL DEFAULT 'TRANSACTIONAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "destination" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "disabledAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_read_createdAt_idx" ON "notifications"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "deliveries_status_nextAttemptAt_idx" ON "deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "deliveries_notificationId_idx" ON "deliveries"("notificationId");

-- CreateIndex
CREATE INDEX "deliveries_providerMessageId_idx" ON "deliveries"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_disabledAt_idx" ON "device_tokens"("userId", "disabledAt");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
