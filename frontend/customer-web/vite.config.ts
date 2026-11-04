/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ command }) => ({
  // Strip console/debugger statements from production output only — dev
  // builds keep them so the browser console stays useful while developing.
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we register manually in src/pwa/registerServiceWorker.ts
      includeAssets: ['icons/moon.svg', 'offline.html'],
      manifest: {
        id: '/',
        name: 'MUNI — Shop Uganda',
        short_name: 'MUNI',
        description:
          'Phones, fashion, home goods and groceries, delivered. Pay with MTN Mobile Money or Airtel Money.',
        theme_color: '#69B8D6',
        background_color: '#69B8D6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/moon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/moon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/moon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      devOptions: {
        // Registers a real SW (via the browser's native ES module support) under
        // `npm run dev` too, instead of only after `vite build && vite preview`.
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
        // The precache manifest workbox injects at build time doesn't exist in
        // dev — silence the "missing manifest" warning this would otherwise log.
        suppressWarnings: true,
      },
      workbox: {
        // Suppresses Workbox's own verbose runtime console logging (cache hit/miss,
        // strategy debug messages) in the generated service worker.
        mode: 'production',
        // App-shell navigations fall back to the cached SPA shell so client-side
        // routing keeps working offline; checkout navigations are intercepted
        // separately below before this catch-all runs.
        navigateFallback: '/index.html',
        // This SW is registered at scope "/", so under the single-domain nginx
        // topology it controls the sibling apps' URLs too. Without denying them,
        // navigating to /seller/ or /admin/ is answered from cache with
        // customer-web's own shell and the real app never loads.
        navigateFallbackDenylist: [
          /^\/offline\.html$/,
          /^\/seller\//,
          /^\/admin\//,
          /^\/api\//,
          /^\/chat\//,
        ],
        runtimeCaching: [
          // Checkout/cart/order pages — network-first, offline fallback.
          // Registered first so it takes priority over the generic navigateFallback.
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && (url.pathname.startsWith('/checkout') || url.pathname.startsWith('/cart')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'muni-checkout-pages',
              networkTimeoutSeconds: 8,
              plugins: [
                {
                  handlerDidError: async () => caches.match('/offline.html'),
                },
              ],
            },
          },
          {
            // Checkout/cart/order/payment endpoints touch money and stock — never
            // show a stale cached response silently. Try the network first, and
            // only fall back to cache (or the offline page) once it's failed.
            //
            // NOTE: the regex MUST be inlined here. vite-plugin-pwa's `generateSW`
            // strategy serializes this function via `.toString()` into the built
            // service worker file — it does not capture the surrounding closure.
            // A module-level `const` referenced here would compile fine but throw
            // `ReferenceError: X is not defined` at runtime inside the SW.
            urlPattern: ({ url }) => /\/api\/v1\/(cart|checkout|orders|payments)(\/|\?|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'muni-checkout-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
              // The dev proxy's responses carry a `Vary: Origin` header. Without this,
              // Workbox logs a warning and cache lookups/deletes can silently miss —
              // we don't want origin-keyed caching here, just one entry per URL.
              matchOptions: { ignoreVary: true },
            },
          },

          // Catalog/browse API calls — stale-while-revalidate.
          {
            // Catalog/browse endpoints — safe to show a cached copy immediately
            // while a fresh one loads in the background. Bandwidth-cheap and
            // tolerant of staleness. See the note above on why this is inlined.
            // Includes /containers (the home page's dynamic-layout endpoint) —
            // same freshness tradeoff as the other catalog/browse data.
            urlPattern: ({ url }) => /\/api\/v1\/(products|categories|search|recommendations|containers)(\/|\?|$)/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'muni-catalog-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
              matchOptions: { ignoreVary: true },
            },
          },

          // Static UI assets and optimized images — cache-first.
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' ||
              request.destination === 'font' ||
              /\.(?:png|jpg|jpeg|webp|avif|svg|gif|woff2?)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'muni-static-assets',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Scoped to `/assets/` (Vite's build output dir, filenames content-hashed)
            // on purpose — NOT just `request.destination === 'script' | 'style'`.
            // In dev, Vite serves every module (/src/**, /@vite/client, /@react-refresh,
            // node_modules/.vite/deps/*) as a script-destination fetch too; matching on
            // destination alone previously CacheFirst-cached your entire dev source tree
            // for up to a week, so edited files could keep being served stale from the
            // SW instead of fresh from Vite. Scoping to /assets/ makes this rule inert
            // in dev (nothing dev-served lives there) and only active against the real
            // hashed production bundle, where CacheFirst-forever is actually correct.
            urlPattern: ({ request, url }) =>
              (request.destination === 'script' || request.destination === 'style') &&
              url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'muni-static-bundle',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Pin the framework deps into their own chunks so they stay in the
        // browser cache across deploys. Without this, Rollup folds them into
        // the app chunk, whose content hash changes on every source edit — so
        // a one-line copy fix on a footer page forces every returning shopper
        // to re-download React, Redux and axios along with it.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'state-vendor': ['@reduxjs/toolkit', 'react-redux'],
          'net-vendor': ['axios'],
          // socket.io-client is deliberately NOT grouped with axios. A manual
          // chunk is fetched as soon as anything in the loaded graph imports it,
          // and axios is on every page — so pairing them would drag socket.io's
          // ~45 kB into the homepage even though only ChatDrawer/useChatSocket
          // needs it. Alone, it loads with the chat route and nowhere else.
          'realtime-vendor': ['socket.io-client'],
        },
      },
    },
    // Deliberately below Rollup's 500 kB default. Route chunks that grow past
    // 250 kB mean a page is pulling in something that belongs in a vendor chunk
    // or behind its own dynamic import — we want that to be noisy, not silent.
    chunkSizeWarningLimit: 250,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Legal documents shared with the mobile app, so /conditions and /privacy
      // render the same source the app does. Dependency-free data only.
      '@legal': path.resolve(__dirname, '../shared/legal/index.ts'),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // Surface a clear cause in the Vite terminal instead of a bare ECONNREFUSED
        // stack when the backend gateway isn't running — this is the #1 cause of
        // "why is my request going straight to :8080 instead of through the proxy".
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            console.error(`[vite proxy] ${req.method} ${req.url} — backend at :8080 unreachable:`, err.message);
          });
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
}));
