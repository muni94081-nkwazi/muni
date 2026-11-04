-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "store_name" TEXT NOT NULL,
    "store_slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logo" TEXT,
    "banner" TEXT,
    "categories" TEXT[],
    "location" JSONB NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "commission_rate" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "joined_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_store_slug_key" ON "stores"("store_slug");

-- CreateIndex
CREATE INDEX "stores_user_id_idx" ON "stores"("user_id");

-- CreateIndex
CREATE INDEX "stores_status_idx" ON "stores"("status");

