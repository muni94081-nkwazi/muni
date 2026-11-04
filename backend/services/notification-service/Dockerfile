# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/notification-service/package.json ./backend/services/notification-service/

RUN npm ci --workspace=backend/services/notification-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/notification-service/ ./backend/services/notification-service/

# The Prisma client must exist before tsc runs.
RUN npm run db:generate --workspace=backend/services/notification-service
RUN npm run build --workspace=backend/services/notification-service

# tsc emits only .ts sources; the generated Prisma client is .js/.d.ts and
# would otherwise be absent from dist, so the container fails at import time.
RUN mkdir -p backend/services/notification-service/dist/services/notification-service/src/generated && cp -R backend/services/notification-service/src/generated/. backend/services/notification-service/dist/services/notification-service/src/generated/

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/notification-service/package.json ./backend/services/notification-service/

RUN npm ci --workspace=backend/services/notification-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/notification-service/node_modules

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

COPY --from=deps    --chown=muni:muni /app/node_modules ./node_modules
COPY --from=deps    --chown=muni:muni /app/backend/services/notification-service/node_modules ./backend/services/notification-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/notification-service/dist ./backend/services/notification-service/dist
COPY --chown=muni:muni backend/services/notification-service/package.json ./backend/services/notification-service/
COPY --from=builder --chown=muni:muni /app/backend/services/notification-service/prisma ./backend/services/notification-service/prisma

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4007/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4007

CMD ["node", "backend/services/notification-service/dist/services/notification-service/src/app.js"]
