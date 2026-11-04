-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tax_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "type" "InvoiceType" NOT NULL DEFAULT 'INVOICE',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "orderId" TEXT NOT NULL,
    "subOrderId" TEXT,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerTin" TEXT,
    "sellerAddress" TEXT,
    "sellerEmail" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerTin" TEXT,
    "buyerAddress" TEXT,
    "buyerEmail" TEXT,
    "countryCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "subtotalExclTax" INTEGER NOT NULL,
    "totalTax" INTEGER NOT NULL,
    "totalInclTax" INTEGER NOT NULL,
    "creditNoteId" TEXT,
    "reversesInvoiceId" TEXT,
    "cancellationReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceKey" TEXT NOT NULL,

    CONSTRAINT "tax_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceExclTax" INTEGER NOT NULL,
    "lineSubtotal" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,
    "taxCategory" TEXT,
    "taxExemptReason" TEXT,

    CONSTRAINT "tax_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_invoiceNumber_key" ON "tax_invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_creditNoteId_key" ON "tax_invoices"("creditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_invoiceKey_key" ON "tax_invoices"("invoiceKey");

-- CreateIndex
CREATE INDEX "tax_invoices_sellerId_issuedAt_idx" ON "tax_invoices"("sellerId", "issuedAt");

-- CreateIndex
CREATE INDEX "tax_invoices_buyerId_issuedAt_idx" ON "tax_invoices"("buyerId", "issuedAt");

-- CreateIndex
CREATE INDEX "tax_invoices_status_issuedAt_idx" ON "tax_invoices"("status", "issuedAt");

-- CreateIndex
CREATE INDEX "tax_invoice_lines_invoiceId_idx" ON "tax_invoice_lines"("invoiceId");

-- AddForeignKey
ALTER TABLE "tax_invoice_lines" ADD CONSTRAINT "tax_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "tax_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
