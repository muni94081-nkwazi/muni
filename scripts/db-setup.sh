#!/usr/bin/env bash
#
# Apply Prisma migrations and seed the catalog.
#
# Nothing in the deployment does this on its own — no service runs
# `migrate deploy` at startup and no Dockerfile does it at build time — so a
# freshly deployed stack has empty databases with no tables, and every service
# that touches Postgres errors on its first query. Run this once after the
# first `npm run deploy`, and again after any migration is added.
#
# Runs from the HOST against the published Postgres port, not inside the
# service containers: the runtime images ship production dependencies only and
# the Prisma CLI is a devDependency, so `prisma` is not present in them.
#
# Usage:
#   ./scripts/db-setup.sh            # migrate, then seed the catalog
#   ./scripts/db-setup.sh --migrate  # migrations only
#   ./scripts/db-setup.sh --seed     # seed only (assumes migrations applied)

set -euo pipefail
cd "$(dirname "$0")/.."

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-muni}"
PGPASSWORD="${PGPASSWORD:-muni_secret}"

DO_MIGRATE=1
DO_SEED=1
case "${1:-}" in
  --migrate) DO_SEED=0 ;;
  --seed)    DO_MIGRATE=0 ;;
  "")        ;;
  *) echo "Unknown option: $1" >&2; exit 1 ;;
esac

# service-directory-name : database-name. Mirrors the DATABASE_URL values in
# docker-compose.yml — keep in sync when a service is added.
SERVICES="
auth-service:muni_auth
product-service:muni_products
user-service:muni_user
payment-service:muni_payment
review-service:muni_review
support-service:muni_support
tax-service:muni_tax
notification-service:muni_notification
dispute-service:muni_dispute
return-service:muni_return
buyer-protection-service:muni_buyer_protection
fulfillment-service:muni_fulfillment
loyalty-service:muni_loyalty
qa-service:muni_qa
wishlist-service:muni_wishlist
marketplace-service:muni_marketplace
pricing-service:muni_pricing
advertising-service:muni_advertising
seller-education-service:muni_seller_education
fraud-service:muni_fraud
"

if ! docker ps --format '{{.Names}}' | grep -q '^muni-postgres$'; then
  echo "ERROR: muni-postgres is not running. Start the stack first: npm run deploy" >&2
  exit 1
fi

if [[ "$DO_MIGRATE" == "1" ]]; then
  echo "── Applying migrations ─────────────────────────────────────────────"
  for entry in $SERVICES; do
    svc="${entry%%:*}"; db="${entry##*:}"
    dir="backend/services/$svc"
    [[ -d "$dir/prisma/migrations" ]] || { echo "  $svc — no migrations, skipping"; continue; }
    echo "  $svc → $db"
    ( cd "$dir" && DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$db" \
        npx --yes prisma migrate deploy 2>&1 | sed 's/^/    /' )
  done
fi

if [[ "$DO_SEED" == "1" ]]; then
  echo
  echo "── Seeding ─────────────────────────────────────────────────────────"
  # product-service is the only service with a catalog seed, and it is the one
  # the storefront reads: 8 categories, 17 products, 2 variants each. Without it
  # the homepage renders its shell and no product tiles.
  echo "  product-service (catalog)"
  ( cd backend/services/product-service \
    && DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/muni_products" \
       npx --yes tsx prisma/seed.ts 2>&1 | sed 's/^/    /' )

  echo
  echo "Seeded. Note there is no admin or seller account seed — see"
  echo "scripts/promote-admin.sh to grant ROLE_ADMIN to a registered user."
fi

echo
echo "── Verify ──────────────────────────────────────────────────────────"
docker exec muni-postgres psql -U "$PGUSER" -d muni_products -c \
  'select relname as table, n_live_tup as rows from pg_stat_user_tables order by n_live_tup desc limit 5;'
