#!/bin/sh
#
# Applies `prisma migrate deploy` for every service that has migrations, then
# exits. Compose gates the services on this finishing successfully.
#
# Fails loudly and immediately: if a migration cannot be applied, the services
# gated on this container never start, which is the correct outcome. A service
# that boots against a database missing its tables just fails on its first
# query instead, far from the actual cause.
#
# migrate deploy is idempotent — it applies only migrations not already in
# _prisma_migrations — so re-running on every `up` is a no-op once current.

set -eu

# service-directory : database-name. Mirrors the DATABASE_URL values in
# docker-compose.yml. Keep in sync when a Prisma-backed service is added.
#
# container-service is deliberately absent: it has a schema.prisma but no
# migrations directory, so `migrate deploy` would exit non-zero and block the
# whole stack. It needs `prisma migrate dev` run once by a developer to
# generate an initial migration before it can be listed here.
SERVICES="
auth-service:muni_auth
product-service:muni_products
user-service:muni_user
payment-service:muni_payment
review-service:muni_review
support-service:muni_support
newsletter-service:muni_newsletter
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
shipping-service:muni_shipping
discount-service:muni_discount
"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-muni}"
PGPASSWORD="${PGPASSWORD:-muni_secret}"

echo "[migrator] waiting for postgres at ${PGHOST}:${PGPORT}…"
# compose already gates on postgres being healthy, but that reports the server
# is accepting connections — not that it is accepting ours. Cheap belt-and-braces.
i=0
until nc -z "$PGHOST" "$PGPORT" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && { echo "[migrator] postgres unreachable after 60s" >&2; exit 1; }
  sleep 1
done

failed=""
for entry in $SERVICES; do
  svc="${entry%%:*}"
  db="${entry##*:}"
  schema="/app/${svc}/prisma/schema.prisma"

  if [ ! -f "$schema" ]; then
    echo "[migrator] SKIP ${svc} — no schema at ${schema}"
    continue
  fi

  echo "[migrator] ── ${svc} → ${db}"
  if DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${db}" \
       npx prisma migrate deploy --schema "$schema"; then
    echo "[migrator]    ok"
  else
    echo "[migrator]    FAILED" >&2
    failed="${failed} ${svc}"
  fi
done

if [ -n "$failed" ]; then
  echo "[migrator] migrations failed for:${failed}" >&2
  exit 1
fi

echo "[migrator] all migrations applied."
