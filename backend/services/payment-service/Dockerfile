# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools for native addons (bcrypt, etc.)
RUN apk add --no-cache python3 make g++ openssl

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/payment-service/package.json ./backend/services/payment-service/

# Full install, dev dependencies included: tsc and the Prisma CLI live there.
RUN npm ci --workspace=backend/services/payment-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/payment-service/ ./backend/services/payment-service/

# The Prisma client is generated into src/generated/prisma (not node_modules —
# see the comment in prisma/schema.prisma). It must exist before tsc runs,
# because src/db/prisma.ts imports its types.
RUN npm run db:generate --workspace=backend/services/payment-service

# Compile TypeScript to plain JavaScript. Production never runs tsx: it is a
# devDependency, and the esbuild binary it needs is not in package-lock.json
# for linux (the lockfile only carries @esbuild/win32-x64).
RUN npm run build --workspace=backend/services/payment-service

RUN mkdir -p backend/services/payment-service/dist/services/payment-service/src \
 && cp -R backend/services/payment-service/src/generated backend/services/payment-service/dist/services/payment-service/src/generated

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/payment-service/package.json ./backend/services/payment-service/

RUN npm ci --workspace=backend/services/payment-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/payment-service/node_modules

# ── Stage 3: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Prisma's query engine is dynamically linked against OpenSSL on Alpine.
RUN apk add --no-cache openssl

# Security: run as non-root
RUN addgroup --system --gid 1001 muni && \
    adduser --system --uid 1001 --ingroup muni muni

ENV NODE_ENV=production

COPY --from=deps --chown=muni:muni /app/node_modules ./node_modules
COPY --from=deps --chown=muni:muni /app/backend/services/payment-service/node_modules ./backend/services/payment-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/payment-service/dist ./backend/services/payment-service/dist
COPY --chown=muni:muni backend/services/payment-service/package.json ./backend/services/payment-service/
COPY --from=builder --chown=muni:muni /app/backend/services/payment-service/prisma ./backend/services/payment-service/prisma

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4005/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4005

CMD ["node", "backend/services/payment-service/dist/services/payment-service/src/app.js"]
