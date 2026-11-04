# One-shot init container that applies every service's Prisma migrations before
# the services themselves start.
#
# Why a separate image rather than a step in each service's Dockerfile:
#
#  - The service runtime images install production dependencies only, and the
#    Prisma CLI is a devDependency. Adding `migrate deploy` to their startup
#    would mean shipping the CLI (and its engines, ~50MB) into all eight.
#  - Migrations are a deploy-time action, not a per-replica one. Running them
#    from each service means N replicas racing to migrate the same database on
#    every rollout. Prisma takes an advisory lock so it is not corrupting, but
#    it serialises startup and turns one failure into N crash-looping services.
#  - A single container that must exit 0 before anything else starts is exactly
#    what compose's service_completed_successfully condition expresses.
#
# Build context is the repo root.

FROM node:20-alpine

WORKDIR /app

# Prisma's schema engine is a native binary linked against OpenSSL, which the
# alpine base does not ship. Without these it loads but cannot start, and every
# `migrate deploy` fails with "Could not parse schema engine response" — the
# engine's plain-text load error arriving where the CLI expects JSON.
RUN apk add --no-cache openssl libc6-compat

# Pinned to match @prisma/client ^5.20 used across the services. The CLI and
# the client must agree on migration-engine format, so this is not a floating
# version.
RUN npm install --no-fund --no-audit prisma@5.20.0

# Only the prisma directories are needed — schema plus migrations. Copying the
# whole services tree would invalidate this layer on every source edit.
COPY backend/services/auth-service/prisma           ./auth-service/prisma
COPY backend/services/product-service/prisma        ./product-service/prisma
COPY backend/services/user-service/prisma           ./user-service/prisma
COPY backend/services/payment-service/prisma        ./payment-service/prisma
COPY backend/services/review-service/prisma         ./review-service/prisma
COPY backend/services/support-service/prisma        ./support-service/prisma
COPY backend/services/newsletter-service/prisma     ./newsletter-service/prisma
COPY backend/services/tax-service/prisma            ./tax-service/prisma
COPY backend/services/notification-service/prisma   ./notification-service/prisma
COPY backend/services/dispute-service/prisma        ./dispute-service/prisma
COPY backend/services/return-service/prisma         ./return-service/prisma
COPY backend/services/buyer-protection-service/prisma ./buyer-protection-service/prisma
COPY backend/services/fulfillment-service/prisma    ./fulfillment-service/prisma
COPY backend/services/loyalty-service/prisma        ./loyalty-service/prisma
COPY backend/services/qa-service/prisma             ./qa-service/prisma
COPY backend/services/wishlist-service/prisma       ./wishlist-service/prisma
COPY backend/services/marketplace-service/prisma    ./marketplace-service/prisma
COPY backend/services/pricing-service/prisma        ./pricing-service/prisma
COPY backend/services/advertising-service/prisma    ./advertising-service/prisma
COPY backend/services/seller-education-service/prisma ./seller-education-service/prisma
COPY backend/services/fraud-service/prisma          ./fraud-service/prisma
COPY backend/services/shipping-service/prisma       ./shipping-service/prisma
COPY backend/services/discount-service/prisma       ./discount-service/prisma

COPY backend/migrator/migrate.sh ./migrate.sh
RUN chmod +x ./migrate.sh

ENTRYPOINT ["/app/migrate.sh"]
