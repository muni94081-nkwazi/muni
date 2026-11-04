# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/newsletter-service/package.json ./backend/services/newsletter-service/

RUN npm ci --workspace=backend/services/newsletter-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/newsletter-service/ ./backend/services/newsletter-service/

# The Prisma client must exist before tsc runs — every service file imports its
# generated types.
RUN npm run db:generate --workspace=backend/services/newsletter-service

RUN npm run build --workspace=backend/services/newsletter-service

# tsc emits only .ts sources; the generated Prisma client is .js/.d.ts and
# would otherwise be absent from dist, so the container fails at import time.
RUN mkdir -p backend/services/newsletter-service/dist/services/newsletter-service/src/generated && cp -R backend/services/newsletter-service/src/generated/. backend/services/newsletter-service/dist/services/newsletter-service/src/generated/

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/newsletter-service/package.json ./backend/services/newsletter-service/

RUN npm ci --workspace=backend/services/newsletter-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/newsletter-service/node_modules

# The production install skips the client generation, so carry the generated
# engine over from the builder rather than re-running it here.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# ── Stage 3: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Prisma's query engine is dynamically linked against OpenSSL on Alpine.
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 muni && \
    adduser --system --uid 1001 --ingroup muni muni

ENV NODE_ENV=production

COPY --from=deps  --chown=muni:muni /app/node_modules ./node_modules
COPY --from=deps  --chown=muni:muni /app/backend/services/newsletter-service/node_modules ./backend/services/newsletter-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/newsletter-service/dist ./backend/services/newsletter-service/dist
COPY --chown=muni:muni backend/services/newsletter-service/package.json ./backend/services/newsletter-service/
COPY --from=builder --chown=muni:muni /app/backend/services/newsletter-service/prisma ./backend/services/newsletter-service/prisma

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4034/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4034

CMD ["node", "backend/services/newsletter-service/dist/services/newsletter-service/src/index.js"]
