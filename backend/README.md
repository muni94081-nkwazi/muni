# MUNI TypeScript microservices

This is the Node.js/TypeScript backend layout used by the React frontend.
The API gateway is the only browser-facing service and listens on port 8080.

## Run locally

```bash
cd backend
npm install
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:8080/api/v1` in the frontend environment.

Implemented services:

- `auth-service` (`:4001`) — register, login, user profile and signed development tokens.
- `product-service` (`:4002`) — product catalog, categories, brands and search response shapes.
- `order-service` (`:4003`) — guest/authenticated cart endpoints and the order API boundary.

The inventory, shipping, payment, search, recommendation, review and notification
directories are reserved service boundaries. Add their own `src`, `package.json`,
Dockerfile, data store and event consumers as each capability is implemented.

For the container stack, run `docker compose up --build` from this directory.
