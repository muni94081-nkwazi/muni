# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools for native addons (bcrypt, etc.). openssl is Prisma's — its
# generator and query engine link against it on Alpine.
RUN apk add --no-cache python3 make g++ openssl

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/shipping-service/package.json ./backend/services/shipping-service/

# Full install, dev dependencies included: tsc and the Prisma CLI live there.
RUN npm ci --workspace=backend/services/shipping-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/shipping-service/ ./backend/services/shipping-service/

# The Prisma client is generated into src/generated/prisma (not node_modules —
# see the comment in prisma/schema.prisma). It must exist before tsc runs,
# because src/db/prisma.ts imports its types.
#
# This step was missing, and src/generated/ is gitignored — so on a clean
# checkout the directory simply does not exist when the build runs and tsc
# fails to resolve the import. It went unnoticed because ci.yml's
# docker-build-check matrix does not build this service.
RUN npm run db:generate --workspace=backend/services/shipping-service

# Compile TypeScript to plain JavaScript. Production never runs tsx: it is a
# devDependency, and the esbuild binary it needs is not in package-lock.json
# for linux (the lockfile only carries @esbuild/win32-x64).
RUN npm run build --workspace=backend/services/shipping-service

# tsc does not emit the generated client (it is pre-built JS plus a native
# engine binary), so it is copied into dist by hand — same as every other
# Prisma service here.
RUN mkdir -p backend/services/shipping-service/dist/services/shipping-service/src \
 && cp -R backend/services/shipping-service/src/generated backend/services/shipping-service/dist/services/shipping-service/src/generated

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/shipping-service/package.json ./backend/services/shipping-service/

RUN npm ci --workspace=backend/services/shipping-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/shipping-service/node_modules

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
COPY --from=deps --chown=muni:muni /app/backend/services/shipping-service/node_modules ./backend/services/shipping-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/shipping-service/dist ./backend/services/shipping-service/dist
COPY --chown=muni:muni backend/services/shipping-service/package.json ./backend/services/shipping-service/
COPY --from=builder --chown=muni:muni /app/backend/services/shipping-service/prisma ./backend/services/shipping-service/prisma

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4006/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4006

CMD ["node", "backend/services/shipping-service/dist/services/shipping-service/src/app.js"]
