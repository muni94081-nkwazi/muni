# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools for native addons, plus openssl: the Prisma query engine that
# `prisma generate` fetches is dynamically linked against it on Alpine.
RUN apk add --no-cache python3 make g++ openssl

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/inventory-service/package.json ./backend/services/inventory-service/

# Full install, dev dependencies included: tsc and the Prisma CLI live there.
RUN npm ci --workspace=backend/services/inventory-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/inventory-service/ ./backend/services/inventory-service/

# The Prisma client is generated into src/generated/prisma (not node_modules —
# see the comment in prisma/schema.prisma). It must exist before tsc runs,
# because src/index.ts and the workers import its types. Generating here is
# also what produces a linux query engine: any client committed from a dev
# machine would carry the wrong platform's binary.
RUN npm run db:generate --workspace=backend/services/inventory-service

# Compile TypeScript to plain JavaScript. Production never runs tsx: it is a
# devDependency, and the esbuild binary it needs is not in package-lock.json
# for linux (the lockfile only carries @esbuild/win32-x64).
RUN npm run build --workspace=backend/services/inventory-service

# tsc emits only the .js it compiled from .ts — the generated client is
# pre-built JavaScript plus a native engine, so it has to be copied across by
# hand. The destination mirrors the emitted layout: dist/services/
# inventory-service/src/index.js resolves './generated/prisma/index.js'
# relative to itself.
RUN mkdir -p backend/services/inventory-service/dist/services/inventory-service/src \
 && cp -R backend/services/inventory-service/src/generated backend/services/inventory-service/dist/services/inventory-service/src/generated

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/inventory-service/package.json ./backend/services/inventory-service/

# The mkdir -p calls guarantee both COPY sources exist in the next stage even
# when npm hoisted everything to the root node_modules and left them empty.
#
# backend/node_modules is not incidental: backend/package.json asks for
# redis ^4.7.1 while backend/infrastructure asks for ^4.6.14, so npm cannot
# satisfy both with one hoisted copy and nests one under backend/. The
# RabbitMQ idempotency guard this service loads at startup imports 'redis',
# so missing that directory is a MODULE_NOT_FOUND crash on boot, not a
# degraded feature.
RUN npm ci --workspace=backend/services/inventory-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/inventory-service/node_modules \
 && mkdir -p backend/node_modules

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
COPY --from=deps --chown=muni:muni /app/backend/node_modules ./backend/node_modules
COPY --from=deps --chown=muni:muni /app/backend/services/inventory-service/node_modules ./backend/services/inventory-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/inventory-service/dist ./backend/services/inventory-service/dist
COPY --chown=muni:muni backend/services/inventory-service/package.json ./backend/services/inventory-service/

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4004/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4004

CMD ["node", "backend/services/inventory-service/dist/services/inventory-service/src/index.js"]
