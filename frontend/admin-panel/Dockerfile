# Build context is ./frontend (not this directory) so the shared spa.nginx.conf
# is reachable. Build with:
#   docker build -f frontend/admin-panel/Dockerfile ./frontend

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Manifests first so the dependency install layer caches independently of source.
COPY admin-panel/package.json ./
RUN npm install

COPY admin-panel/ ./

# Vite reads .env.production automatically for `vite build`. VITE_* values are
# inlined into the bundle at build time — they are not runtime configuration.
# Served at /admin/ by the edge nginx. vite.config.ts sets `base` for build only;
# the router reads it back via import.meta.env.BASE_URL for its basename.
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY spa.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s   CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
