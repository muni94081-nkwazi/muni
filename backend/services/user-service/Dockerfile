# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools for native addons (bcryptjs is pure JS, but transitive deps aren't).
RUN apk add --no-cache python3 make g++ openssl

# Workspace manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/user-service/package.json ./backend/services/user-service/

# Full install, dev dependencies included: tsc and the Prisma CLI live there.
RUN npm ci --workspace=backend/services/user-service --include-workspace-root

COPY backend/shared/ ./backend/shared/
COPY backend/services/user-service/ ./backend/services/user-service/

# The Prisma client must be generated before tsc runs — src/config/prisma.ts
# and every service file import its generated types.
RUN npm run db:generate --workspace=backend/services/user-service

# Compile TypeScript to plain JavaScript. Production never runs tsx: it is a
# devDependency, and the esbuild binary it needs is not in package-lock.json
# for linux (the lockfile only carries @esbuild/win32-x64).
RUN npm run build --workspace=backend/services/user-service

# tsc emits only .ts sources; the generated Prisma client is .js/.d.ts and
# would otherwise be absent from dist, so the container fails at import time.
RUN mkdir -p backend/services/user-service/dist/services/user-service/src/generated && cp -R backend/services/user-service/src/generated/. backend/services/user-service/dist/services/user-service/src/generated/

# ── Stage 2: Production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/shared/package.json ./backend/shared/
COPY backend/services/user-service/package.json ./backend/services/user-service/

RUN npm ci --workspace=backend/services/user-service --include-workspace-root --omit=dev \
 && mkdir -p backend/services/user-service/node_modules

# The production install skips the postinstall that generates the client, so
# copy the generated engine + client from the builder rather than re-running it.
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
COPY --from=deps --chown=muni:muni /app/backend/services/user-service/node_modules ./backend/services/user-service/node_modules
COPY --from=builder --chown=muni:muni /app/backend/services/user-service/dist ./backend/services/user-service/dist
COPY --chown=muni:muni backend/services/user-service/package.json ./backend/services/user-service/
COPY --from=builder --chown=muni:muni /app/backend/services/user-service/prisma ./backend/services/user-service/prisma

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

USER muni
EXPOSE 3001

CMD ["node", "backend/services/user-service/dist/services/user-service/src/index.js"]
