-- PostgreSQL init script: runs automatically on first start of muni-postgres.
--
-- One database per service that owns relational state, so a schema migration
-- in one service cannot lock or break another. Services that share a database
-- do so deliberately and are noted below.
--
-- POSTGRES_DB in compose creates muni_auth; everything else is created here.
-- This file only runs when the postgres data volume is empty — to re-run it,
-- drop the volume (docker compose down -v).

SELECT 'Creating MUNI service databases...' AS log;

-- product-service owns the catalogue schema. inventory-service deliberately
-- shares it: stock lives on ProductVariant, and splitting them would make
-- every stock check a cross-service join.
CREATE DATABASE muni_products
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Identity, sessions, address book, seller trust/scorecard.
CREATE DATABASE muni_user
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Payments, refunds, vendor payouts.
CREATE DATABASE muni_payment
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Reviews, review media, helpfulness votes, and the purchase projection that
-- verified-purchase enforcement reads.
CREATE DATABASE muni_review
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Notification inbox, per-channel delivery records, FCM device tokens.
CREATE DATABASE muni_notification
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Discounts, coupons, flash sales.
CREATE DATABASE muni_discount
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Container import jobs and consignments.
CREATE DATABASE muni_container
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Support tickets (helpdesk).
CREATE DATABASE muni_support
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Newsletter subscriptions, with the consent evidence for each address.
CREATE DATABASE muni_newsletter
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Tax invoices and VAT records.
CREATE DATABASE muni_tax
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Buyer claims, evidence, the seller-resolution SLA clock and admin
-- arbitration outcomes. Separate from muni_payment on purpose: a dispute
-- decides whether an escrow hold is released, but payment-service remains the
-- only writer of the ledger itself.
CREATE DATABASE muni_dispute
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Return requests (RMAs) and their line items.
CREATE DATABASE muni_return
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Buyer protection claims, and the escrow holds that decide when a
-- seller payout may release. payment-service moves the money; this
-- database records whether it is allowed to.
CREATE DATABASE muni_buyer_protection
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Fulfillments, rider assignments, digital signatures, and the COD cash
-- ledger reconciling what each rider collected against what they remitted.
CREATE DATABASE muni_fulfillment
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Loyalty balances, the points ledger, reward catalogue and redemptions.
CREATE DATABASE muni_loyalty
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Product questions, seller answers, and helpfulness votes.
CREATE DATABASE muni_qa
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Wishlists and their items, price alerts, share links and collaborators.
CREATE DATABASE muni_wishlist
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Seller storefronts.
CREATE DATABASE muni_marketplace
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Repricing rules, observed competitor prices, and the price-change audit trail.
CREATE DATABASE muni_pricing
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Sponsored-product campaigns and the click log they are billed from.
CREATE DATABASE muni_advertising
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Seller onboarding progress and webinar registrations. The course
-- catalogue is not here — it is read-only content held in code.
CREATE DATABASE muni_seller_education
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Fraud assessments: every scored order, its rules and its verdict.
CREATE DATABASE muni_fraud
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

-- Shipments, their tracking events and delivery proofs, plus the pickup
-- station (PUDO) network and the packages held at each one. All of it lived in
-- process memory until now, so a restart erased every parcel on the platform.
CREATE DATABASE muni_shipping
  WITH OWNER = muni ENCODING = 'UTF8' TEMPLATE = template0;

GRANT ALL PRIVILEGES ON DATABASE muni_products     TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_user         TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_payment      TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_review       TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_notification TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_discount     TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_container    TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_support      TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_tax          TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_dispute      TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_return           TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_buyer_protection TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_fulfillment      TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_loyalty          TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_qa               TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_wishlist         TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_marketplace      TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_pricing          TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_advertising      TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_seller_education TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_fraud            TO muni;
GRANT ALL PRIVILEGES ON DATABASE muni_shipping         TO muni;

SELECT 'MUNI service databases created.' AS log;
