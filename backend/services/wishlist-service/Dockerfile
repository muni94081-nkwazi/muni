# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools for native addons (bcrypt, etc.)
RUN apk add --no-cache python3 make g++ openssl

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/wishlist-service/package.json ./backend/services/wishlist-service/

# Full install, dev dependencies included: tsc and the Prisma CLI live there.
RUN npm ci --workspace=backend/services/wishlist-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/wishlist-service/ ./backend/services/wishlist-service/

# Compile TypeScript to plain JavaScript. Production never runs tsx: it is a
# devDependency, and the esbuild binary it needs is not in package-lock.json
# for linux (the lockfile only carries @esbuild/win32-x64).
# The Prisma client is generated into src/generated/prisma, not node_modules,
# so it must exist before tsc runs. Generating here also produces a linux
# query engine rather than whatever the dev machine had.
RUN npm run db:generate --workspace=backend/services/wishlist-service

RUN npm run build --workspace=backend/services/wishlist-service

# tsc emits only what it compiled from .ts; the generated client is prebuilt
# JS plus a native engine, so it is copied across by hand.
RUN mkdir -p backend/services/wishlist-service/dist/services/wishlist-service/src \
 && cp -R backend/services/wishlist-service/src/generated backend/services/wishlist-service/dist/services/wishlist-service/src/generated

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/wishlist-service/package.json ./backend/services/wishlist-service/

RUN npm ci --workspace=backend/services/wishlist-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/wishlist-service/node_modules

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
COPY --from=deps --chown=muni:muni /app/backend/services/wishlist-service/node_modules ./backend/services/wishlist-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/wishlist-service/dist ./backend/services/wishlist-service/dist
COPY --chown=muni:muni backend/services/wishlist-service/package.json ./backend/services/wishlist-service/

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4016/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4016

CMD ["node", "backend/services/wishlist-service/dist/services/wishlist-service/src/app.js"]
