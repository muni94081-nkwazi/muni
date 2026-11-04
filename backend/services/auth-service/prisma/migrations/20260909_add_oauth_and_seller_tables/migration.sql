-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('national_id', 'passport', 'business_registration', 'tax_certificate', 'bank_statement', 'other');

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'individual',
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "businessEmail" TEXT,
    "businessPhone" TEXT,
    "businessAddress" JSONB NOT NULL,
    "bankAccount" JSONB NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verificationReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "storeName" TEXT,
    "storeSlug" TEXT,
    "storeDescription" TEXT,
    "storeBannerUrl" TEXT,
    "storeLogoUrl" TEXT,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_documents" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerUserId_key" ON "oauth_accounts"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_profiles_userId_key" ON "seller_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_profiles_storeSlug_key" ON "seller_profiles"("storeSlug");

-- CreateIndex
CREATE INDEX "seller_profiles_verificationStatus_idx" ON "seller_profiles"("verificationStatus");

-- CreateIndex
CREATE INDEX "seller_documents_sellerId_idx" ON "seller_documents"("sellerId");

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
