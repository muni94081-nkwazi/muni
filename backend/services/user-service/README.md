# user-service

Auth & user profile microservice for the MUNI Uganda e-commerce platform.
Node.js / Express / Prisma (PostgreSQL) / KafkaJS.

## Endpoints

Mounted at the service root (the gateway is expected to strip its own
`/api/v1` prefix before proxying here):

| Method | Path                     | Auth | Description                          |
|--------|--------------------------|------|---------------------------------------|
| GET    | `/health`                | none | Liveness/readiness probe              |
| POST   | `/auth/register`         | none | Create account, returns tokens        |
| POST   | `/auth/login`            | none | Email + password login                |
| POST   | `/auth/refresh`          | none | Rotate a refresh token for a new pair |
| POST   | `/auth/logout`           | none | Revoke a refresh token                |
| POST   | `/auth/forgot-password`  | none | Always returns success; emits event   |
| POST   | `/auth/reset-password`   | none | Consume reset token, set new password |
| GET    | `/users/me`              | Bearer | Current user's profile              |
| PATCH  | `/users/me`              | Bearer | Update first/last name, phone       |

## Local setup

```bash
cp .env.example .env
npm install
npm run prisma:migrate   # creates tables in your Postgres instance
npm run dev               # nodemon, http://localhost:3001
```

Test it directly (bypassing the gateway) with:

```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Mugenyi","lastName":"K","email":"m@example.com","password":"Passw0rd!"}'
```

## Wiring this into api-gateway (fixes the 502 from before)

The 502 you hit on `/api/v1/auth/register` happens when the gateway can't
reach this service. Two things to double check once this container is up:

1. **Proxy target uses the Docker service name, not `localhost`.** In
   `docker-compose.yml`, the gateway's env/config should point at
   `http://user-service:3001`, matching whatever you name this service in
   compose — not `http://localhost:3001`.
2. **Path rewrite strips the gateway's prefix.** If the gateway routes
   `/api/v1/auth/*` here, it should rewrite to `/auth/*` before forwarding,
   since this service doesn't repeat the `/api/v1` prefix itself.

## Docker Compose service snippet

```yaml
user-service:
  build: ./user-service
  ports:
    - "3001:3001"
  environment:
    DATABASE_URL: postgresql://muni:muni@user-db:5432/user_service?schema=public
    JWT_ACCESS_SECRET: change-me-access-secret
    JWT_REFRESH_SECRET: change-me-refresh-secret
    KAFKA_BROKERS: kafka:9092
  depends_on:
    - user-db
    - kafka

user-db:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: muni
    POSTGRES_PASSWORD: muni
    POSTGRES_DB: user_service
  volumes:
    - user-db-data:/var/lib/postgresql/data
```

## Kafka events published

| Topic                              | When                              | Consumers (suggested)          |
|-------------------------------------|------------------------------------|---------------------------------|
| `user.registered`                   | After successful registration      | notification-service, analytics-service |
| `user.password_reset_requested`     | After forgot-password (raw token here) | notification-service (sends the email/SMS) |
| `user.password_reset`               | After password successfully reset  | notification-service, analytics-service |
| `user.profile_updated`              | After profile update                | analytics-service               |

Note: the raw password-reset token is only ever placed on the
`user.password_reset_requested` event for notification-service to deliver —
it's never returned in the HTTP response or logged, since anyone with it
can reset that account's password within the TTL window.

## Design notes

- Refresh tokens are stored hashed (SHA-256) and rotated on every use —
  reusing an old refresh token fails.
- Login and "user not found" return identical 401s to avoid account
  enumeration; forgot-password always returns 200 regardless of whether
  the email exists.
- Resetting a password revokes all of that user's existing refresh tokens.
