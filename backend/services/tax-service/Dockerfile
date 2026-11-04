# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools for native addons (bcrypt, etc.). openssl is needed at generate
# time: Prisma reads the libssl version to pick its query engine, and without it
# falls back to openssl-1.1.x and fetches the wrong binary.
RUN apk add --no-cache python3 make g++ openssl

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/tax-service/package.json ./backend/services/tax-service/

# Full install, dev dependencies included: tsc and the Prisma CLI live there.
RUN npm ci --workspace=backend/services/tax-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/tax-service/ ./backend/services/tax-service/

# tax-service gained a Prisma schema (invoices) but this build never generated a
# client, so the image would have shipped whatever was generated on the author's
# machine — including a Windows query engine, which cannot load on Alpine.
RUN npm run db:generate --workspace=backend/services/tax-service

# Compile TypeScript to plain JavaScript. Production never runs tsx: it is a
# devDependency, and the esbuild binary it needs is not in package-lock.json
# for linux (the lockfile only carries @esbuild/win32-x64).
RUN npm run build --workspace=backend/services/tax-service

# tsc emits only .ts sources; the generated Prisma client is .js/.d.ts and would
# otherwise be absent from dist, so the container fails at import time.
RUN mkdir -p backend/services/tax-service/dist/services/tax-service/src/generated && cp -R backend/services/tax-service/src/generated/. backend/services/tax-service/dist/services/tax-service/src/generated/

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/tax-service/package.json ./backend/services/tax-service/

RUN npm ci --workspace=backend/services/tax-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/tax-service/node_modules

# The production install skips the postinstall that generates the client, so
# carry the generated engine over from the builder rather than re-running it.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

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
COPY --from=deps --chown=muni:muni /app/backend/services/tax-service/node_modules ./backend/services/tax-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/tax-service/dist ./backend/services/tax-service/dist
COPY --chown=muni:muni backend/services/tax-service/package.json ./backend/services/tax-service/
COPY --from=builder --chown=muni:muni /app/backend/services/tax-service/prisma ./backend/services/tax-service/prisma

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4014/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4014

CMD ["node", "backend/services/tax-service/dist/services/tax-service/src/app.js"]
