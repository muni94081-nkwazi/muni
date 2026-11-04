-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('TRENDING', 'DEALS', 'NEW_ARRIVALS', 'FEATURED', 'CATEGORY', 'SELLER_PICKS', 'RECOMMENDED', 'FLASH_SALE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('CATEGORY', 'SELLER', 'PRICE_RANGE', 'MIN_RATING', 'IN_STOCK_ONLY', 'DISCOUNT_PERCENTAGE', 'TAG', 'CUSTOM');

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ContainerType" NOT NULL,
    "icon" TEXT,
    "displayMode" TEXT NOT NULL DEFAULT 'grid',
    "itemsPerRow" INTEGER NOT NULL DEFAULT 4,
    "maxItems" INTEGER NOT NULL DEFAULT 12,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "bgColor" TEXT DEFAULT '#ffffff',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerProduct" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedBy" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "ContainerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerRule" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "value" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Container_slug_key" ON "Container"("slug");

-- CreateIndex
CREATE INDEX "ContainerProduct_productId_idx" ON "ContainerProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerProduct_containerId_productId_key" ON "ContainerProduct"("containerId", "productId");

-- AddForeignKey
ALTER TABLE "ContainerProduct" ADD CONSTRAINT "ContainerProduct_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerRule" ADD CONSTRAINT "ContainerRule_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 8.0.0-rc.12                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
