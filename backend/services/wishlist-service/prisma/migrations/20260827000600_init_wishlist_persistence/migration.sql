-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('view', 'edit');

-- CreateEnum
CREATE TYPE "WishlistAction" AS ENUM ('add_item', 'remove_item', 'share', 'add_collaborator');

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "wishlist_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_image" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "price_at_add" DECIMAL(14,2) NOT NULL,
    "current_price" DECIMAL(14,2) NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_trackings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "target_price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "current_price" DECIMAL(14,2) NOT NULL,
    "last_checked_at" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_trackings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history_points" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,

    CONSTRAINT "price_history_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_shares" (
    "share_token" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "wishlist_id" TEXT NOT NULL,
    "shared_with_user_id" TEXT,
    "permission" "SharePermission" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "wishlist_shares_pkey" PRIMARY KEY ("share_token")
);

-- CreateTable
CREATE TABLE "wishlist_collaborators" (
    "id" TEXT NOT NULL,
    "wishlist_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT,
    "permission" "SharePermission" NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_activities" (
    "id" TEXT NOT NULL,
    "wishlist_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "WishlistAction" NOT NULL,
    "timestamp" TEXT NOT NULL,

    CONSTRAINT "wishlist_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wishlists_user_id_created_at_idx" ON "wishlists"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "wishlists_is_public_idx" ON "wishlists"("is_public");

-- CreateIndex
CREATE INDEX "wishlist_items_product_id_idx" ON "wishlist_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_wishlist_id_product_id_key" ON "wishlist_items"("wishlist_id", "product_id");

-- CreateIndex
CREATE INDEX "price_trackings_user_id_is_active_idx" ON "price_trackings"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "price_trackings_product_id_idx" ON "price_trackings"("product_id");

-- CreateIndex
CREATE INDEX "price_history_points_product_id_timestamp_idx" ON "price_history_points"("product_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_shares_id_key" ON "wishlist_shares"("id");

-- CreateIndex
CREATE INDEX "wishlist_shares_wishlist_id_idx" ON "wishlist_shares"("wishlist_id");

-- CreateIndex
CREATE INDEX "wishlist_collaborators_wishlist_id_idx" ON "wishlist_collaborators"("wishlist_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_collaborators_wishlist_id_user_id_key" ON "wishlist_collaborators"("wishlist_id", "user_id");

-- CreateIndex
CREATE INDEX "wishlist_activities_wishlist_id_timestamp_idx" ON "wishlist_activities"("wishlist_id", "timestamp");

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

