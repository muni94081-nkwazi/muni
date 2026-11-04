# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools for native addons (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/cart-service/package.json ./backend/services/cart-service/

# Full install, dev dependencies included: tsc and the Prisma CLI live there.
RUN npm ci --workspace=backend/services/cart-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/cart-service/ ./backend/services/cart-service/

# Compile TypeScript to plain JavaScript. Production never runs tsx: it is a
# devDependency, and the esbuild binary it needs is not in package-lock.json
# for linux (the lockfile only carries @esbuild/win32-x64).
RUN npm run build --workspace=backend/services/cart-service

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/cart-service/package.json ./backend/services/cart-service/

RUN npm ci --workspace=backend/services/cart-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/cart-service/node_modules

# ── Stage 3: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 muni && \
    adduser --system --uid 1001 --ingroup muni muni

ENV NODE_ENV=production

COPY --from=deps --chown=muni:muni /app/node_modules ./node_modules
COPY --from=deps --chown=muni:muni /app/backend/services/cart-service/node_modules ./backend/services/cart-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/cart-service/dist ./backend/services/cart-service/dist
COPY --chown=muni:muni backend/services/cart-service/package.json ./backend/services/cart-service/

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4017/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 4017

CMD ["node", "backend/services/cart-service/dist/services/cart-service/src/app.js"]
