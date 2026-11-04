# MUNI Frontend

React + TypeScript + Redux Toolkit storefront for the MUNI e-commerce
platform, talking to the backend exclusively through the API gateway
(`muni-api-gateway`, port 8080).

## Design identity

"Kampala market signage" — deep market-stall green, marigold/turmeric
accent, terracotta for destructive actions, paired with Space Grotesk
(display) + Inter (body) + JetBrains Mono (prices/SKUs). The signature
visual device is the **price tag**: a clipped-corner marigold tag on
every product card, cart line, and order summary, rendered in monospace
to read like hand-lettered market pricing rather than generic SaaS
typography. See `src/styles/variables.css` for the full token set.

## Getting started

```bash
npm install
cp .env.example .env   # point VITE_API_BASE_URL at your gateway
npm run dev             # http://localhost:5174
```

Requires the backend stack running (see `muni-platform/docker-compose.yml`)
with the API gateway reachable at the URL in `.env`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc --noEmit`) then production build |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | ESLint over `src/` |

## Architecture notes

- **API layer** (`src/api/`): one file per backend service, each a thin
  wrapper around a shared `axios` instance (`axios.config.ts`) that
  handles JWT attachment, automatic refresh-on-401, and the
  `X-Cart-Session` header guest checkout needs.
- **State** (`src/store/`): Redux Toolkit slices per domain (auth,
  products, cart, orders, ui). Async work goes through
  `createAsyncThunk`; components consume state via the hooks in
  `src/hooks/`, never by dispatching thunks directly.
- **Guest cart → user cart merge**: handled automatically in
  `authSlice`'s `login`/`register` thunks — any cart built up
  anonymously (tracked via a `CART_SESSION_KEY` in localStorage) is
  merged into the authenticated user's cart immediately after sign-in,
  matching cart-service's `/cart/merge` endpoint.
- **System status page** (`/system-status`): polls every backend
  service's own health endpoint directly (bypassing the gateway) every
  15s, so a gateway outage and a single-service outage are visually
  distinguishable. Useful during local development to see the whole
  platform's liveness at a glance.

## Known limitations

- Payment-service has no browser-facing routes by design (it's
  service-to-service only); `payment.api.ts` reflects this by routing
  "pay for this order" through order-service instead, then polling the
  order's own status for the payment outcome.
- `SystemStatusPage` hardcodes `localhost:808X` URLs for each service,
  which only resolves correctly for local docker-compose development —
  it is not meant to be exposed in a real deployment as-is.
