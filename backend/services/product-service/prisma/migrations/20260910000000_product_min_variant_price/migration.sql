-- Cheapest ACTIVE variant price, maintained by product-service.
--
-- Display and filtering disagreed: formatProduct shows the cheapest variant
-- ("from UGX 31,000") while both query paths — the Postgres browse and the
-- Elasticsearch document — filtered and sorted on basePrice. A product
-- displayed at 31,000 was therefore missed by maxPrice=35000, missed by
-- minPrice=45000 despite having a 47,000 variant, and ordered in a price sort
-- by a figure the shopper never saw.
--
-- basePrice keeps its meaning (the seller's product-level list price); this
-- column carries the value customers are actually shown and filtered on.
ALTER TABLE "Product" ADD COLUMN "minVariantPrice" DECIMAL(12,2);

-- Backfill from the current active variants, so existing listings filter
-- correctly from the moment this lands. Products with no active variant fall
-- back to basePrice, which is what formatProduct displays for them too.
UPDATE "Product" p
SET "minVariantPrice" = COALESCE(
  (SELECT MIN(v."price") FROM "ProductVariant" v
    WHERE v."productId" = p."id" AND v."active" = true),
  p."basePrice"
);

-- Serves the price filter and the price sort.
CREATE INDEX "Product_status_minVariantPrice_idx" ON "Product"("status", "minVariantPrice");
