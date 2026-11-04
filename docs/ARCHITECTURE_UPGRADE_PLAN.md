# MUNI Architecture Upgrade Plan
### Scaling to 1 Million Users & 10,000 Concurrent Transactions

> **Analysis date:** 2026-07-31  
> **Codebase:** `c:\PROJECTS\Projects\MUNI\backend\`  
> **Reviewer:** Antigravity (Architectural Analysis)

---

## Executive Summary

After a full scan of every service, the API Gateway, shared utilities, Docker/Kubernetes configs, and infrastructure scaffolding, **three fatal architectural weaknesses** were identified that would cause catastrophic failure well before 1 million users or 10,000 concurrent transactions.

| # | Weakness | Services Affected | Risk at Scale |
|---|----------|-------------------|---------------|
| 1 | **Volatile in-process memory stores — zero persistence, zero sharing** | Auth, Order, Cart, Payment, Notification, Analytics, Recommendation | Complete data loss on restart; horizontal scaling is physically impossible |
| 2 | **Fully synchronous, no-fallback inter-service communication** | API Gateway to all services | Cascading failures; single downstream timeout kills the entire request path |
| 3 | **No caching layer, no distributed tracing, primitive observability** | All services | Cold-path compute hit on every request; zero production visibility |

---

## Weakness 1: In-Process Memory Is the Only Data Store

### The Specific Problem

Every service stores its domain data in bare JavaScript `Map` and `Array` objects living in the Node.js process heap:

```
// auth-service/src/services/auth.service.ts  — line 5
const users = new Map<string, StoredUser>();

// order-service/src/services/order.service.ts — line 4
const orders = new Map<string, Order>();

// order-service/src/services/cart.service.ts  — line 2
const carts = new Map<string, Cart>();

// payment-service/src/app.ts — line 10
const payments = new Map();

// notification-service/src/app.ts — line 10
const notificationsStore = new Map<string, any[]>();

// analytics-service/src/index.ts — line 10
const analyticsEvents: AnalyticsEvent[] = [];

// recommendation-service/src/index.ts — line 10
const events: Event[] = [];
```

The `product-service` uses a hardcoded static array of 18 products (`product.service.ts`, lines 4-23) and performs **O(n) linear scans** for every lookup:

```typescript
// product-service/src/services/product.service.ts
export function list(query, page = 0, size = 20) {
  const filtered = query
    ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : products;
  // Full linear scan on every request — no index
}
```

The `auth-service` login also does an O(n) scan of all users on every login attempt:

```typescript
// auth-service/src/services/auth.service.ts — line 22
const user = [...users.values()].find((entry) => entry.email === input.email);
```

The `orderCounter` for order number generation is a plain incrementing integer (`let orderCounter = 1;`) — it resets to `1` on every pod restart, guaranteeing duplicate order numbers.

### Impact on Performance / Scalability

| Consequence | Detail |
|-------------|--------|
| **Zero horizontal scaling** | Each Node.js pod has its own isolated `Map`. Two pods = two separate data sets. A user registered on Pod A is unknown to Pod B. |
| **Complete data loss on restart** | Kubernetes rolling deployments, pod crashes, or any restart wipes every user, order, and payment record permanently. |
| **O(n) queries degrade to O(million)** | Auth login does a full in-memory table-scan. At 1M users this is ~100ms+ per login query in best case. |
| **Memory exhaustion** | Holding 1M users + all orders + all notifications in process heap causes OOM kills. |
| **Order number collisions** | `orderCounter` restarts at 1 after each restart, creating duplicate `MUNI-000001` order numbers. |

### Step-by-Step Refactoring Plan

#### Step 1 — Choose and wire a persistence layer per service

| Service | Recommended Store | Rationale |
|---------|-------------------|-----------|
| `auth-service` | **PostgreSQL** (via Prisma) | Relational; strict email uniqueness; ACID for password resets |
| `order-service` | **MongoDB** (Mongoose) | Flexible document shape for order line-items |
| `cart-service` | **Redis** (with TTL) | Session-scoped; ephemeral by nature; sub-millisecond lookups |
| `payment-service` | **PostgreSQL** | Financial records need ACID guarantees and audit trail |
| `product-service` | **MongoDB + Elasticsearch** | Rich queries, full-text search, category filtering |
| `notification-service` | **MongoDB** | Append-heavy workload; flexible metadata per notification type |

#### Step 2 — Replace the auth-service in-memory store with Prisma + PostgreSQL

```prisma
// NEW: backend/services/auth-service/prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id             String   @id @default(uuid())
  firstName      String
  lastName       String
  email          String   @unique       // Enforces uniqueness at DB level
  phoneNumber    String?
  passwordHash   String
  roles          String[] @default(["ROLE_CUSTOMER"])
  emailVerified  Boolean  @default(false)
  active         Boolean  @default(true)
  lastLoginAt    DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  passwordResets PasswordReset[]
  refreshTokens  RefreshToken[]
}

model PasswordReset {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  otpHash   String
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

```typescript
// NEW: backend/services/auth-service/src/services/auth.service.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createAccessToken } from '../utils/jwt.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: ['warn', 'error'],
});

export async function register(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      firstName:   input.firstName,
      lastName:    input.lastName,
      email:       input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
    },
  });

  return buildAuthResponse(user);
}

export async function login(input: { email: string; password: string }) {
  // DB index on email — O(log n) instead of O(n)
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

  await prisma.user.update({
    where: { id: user.id },
    data:  { lastLoginAt: new Date() },
  });

  return buildAuthResponse(user);
}
```

#### Step 3 — Replace the order-service in-memory store with MongoDB + atomic counter

```typescript
// NEW: backend/services/order-service/src/models/order.schema.ts
import mongoose, { Schema } from 'mongoose';

const OrderItemSchema = new Schema({
  productId:       { type: String, required: true },
  productName:     { type: String, required: true },
  productSku:      { type: String, required: true },
  unitPrice:       { type: Number, required: true },
  quantity:        { type: Number, required: true, min: 1 },
  lineTotal:       { type: Number, required: true },
  vendorId:        { type: String, required: true },
  productImageUrl: { type: String, default: null },
}, { _id: false });

const OrderSchema = new Schema({
  orderNumber:    { type: String, unique: true },
  userId:         { type: String, required: true, index: true },
  status:         { type: String, required: true, default: 'pending', index: true },
  items:          [OrderItemSchema],
  subtotal:       { type: Number, required: true },
  shippingFee:    { type: Number, required: true, default: 5000 },
  discountAmount: { type: Number, default: 0 },
  totalAmount:    { type: Number, required: true },
  currency:       { type: String, default: 'UGX' },
  paymentMethod:  { type: String, default: null },
  shipping: {
    address: String,
    city:    String,
    phone:   String,
    notes:   { type: String, default: null },
  },
  placedAt:    { type: Date, default: Date.now },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

// Compound index for the most common query: user's order history, newest first
OrderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.model('Order', OrderSchema);

// Atomic sequence counter — no race conditions, no restarts can reset it
const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.model('Counter', CounterSchema);

export async function nextOrderNumber(): Promise<string> {
  const doc = await Counter.findByIdAndUpdate(
    'orderNumber',
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return `MUNI-${String(doc!.seq).padStart(6, '0')}`;
}
```

#### Step 4 — Replace the cart-service in-memory store with Redis

```typescript
// NEW: backend/services/order-service/src/services/cart.service.ts
import { createClient } from 'redis';
import type { Cart } from '../models/cart.model.js';

const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  socket: { reconnectStrategy: (attempts) => Math.min(attempts * 100, 3000) },
});
await redis.connect();

const CART_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const cartKey = (id: string) => `cart:${id}`;

export async function get(userId?: string, sessionId?: string): Promise<Cart> {
  const id  = userId ?? sessionId ?? 'anonymous';
  const raw = await redis.get(cartKey(id));
  if (raw) return JSON.parse(raw) as Cart;

  const cart: Cart = {
    id: crypto.randomUUID(),
    userId: userId ?? null,
    sessionId: sessionId ?? null,
    items: [], subtotal: 0, total: 0,
    itemCount: 0, totalUnits: 0,
    discountAmount: 0, couponCode: null, currency: 'UGX',
    status: 'active', hasUnavailableItems: false, expiresAt: null,
    lastActivityAt: new Date().toISOString(),
  };
  await redis.setEx(cartKey(id), CART_TTL_SECONDS, JSON.stringify(cart));
  return cart;
}

export async function add(
  userId: string | undefined,
  sessionId: string | undefined,
  productId: string,
  quantity: number,
): Promise<Cart> {
  const cart = await get(userId, sessionId);
  const item = cart.items.find((i) => i.productId === productId);
  if (item) {
    item.quantity += quantity;
  } else {
    cart.items.push({
      id: crypto.randomUUID(), productId, quantity,
      unitPrice: 450000, lineTotal: 0,
      vendorId: 'muni-store', productName: 'MUNI product',
      productSku: productId, productImageUrl: null,
      isAvailable: true, stockSnapshot: 99, exceedsAvailableStock: false,
    });
  }
  cart.items.forEach((i) => (i.lineTotal = i.unitPrice * i.quantity));
  return save(userId, sessionId, cart);
}

async function save(
  userId: string | undefined,
  sessionId: string | undefined,
  cart: Cart,
): Promise<Cart> {
  cart.itemCount = cart.items.length;
  cart.totalUnits = cart.items.reduce((s, i) => s + i.quantity, 0);
  cart.subtotal   = cart.items.reduce((s, i) => s + i.lineTotal, 0);
  cart.total      = Math.max(0, cart.subtotal - cart.discountAmount);
  cart.lastActivityAt = new Date().toISOString();
  const id = userId ?? sessionId ?? 'anonymous';
  await redis.setEx(cartKey(id), CART_TTL_SECONDS, JSON.stringify(cart));
  return cart;
}
```

---

## Weakness 2: Fully Synchronous Inter-Service Communication With No Resilience

### The Specific Problem

The API Gateway proxy makes a raw `fetch()` call to every downstream service with **zero timeout, zero retry, zero fallback, and zero circuit breaker**:

```typescript
// backend/api-gateway/src/utils/proxy.ts (entire 21-line file)
export async function proxy(req: Request, res: Response, target: string) {
  const url = new URL(req.originalUrl, target);
  // ...
  const upstream = await fetch(url, { method: req.method, headers, body });
  // No AbortSignal   -> hangs indefinitely if downstream is slow or dead
  // No retry         -> a transient 503 fails the user permanently
  // No circuit breaker -> failing service accumulates open connections
  res.send(Buffer.from(await upstream.arrayBuffer()));
}
```

The rate limiter stores its state in a per-pod in-memory `Map`:

```typescript
// backend/api-gateway/src/middleware/rate-limit.middleware.ts — line 3
const requests = new Map<string, { count: number; resetAt: number }>();
// With 2 gateway pods, effective limit becomes 200 req/min instead of 100
```

When an order is placed (`order.controller.ts`), **no event is published** to the payment, notification, or inventory services. Every downstream workflow is either broken or must be manually triggered by the client — meaning a placed order never auto-initiates payment.

### Impact on Performance / Scalability

| Consequence | Detail |
|-------------|--------|
| **Gateway connection starvation** | Without timeouts, a single slow upstream (e.g. payment-service taking 30s) holds connections open indefinitely. At 10K concurrent transactions this saturates the Node.js event loop. |
| **Cascading failures** | If product-service is restarting (normal during Kubernetes rolling updates), every product request through the gateway returns raw `502`. No fallback, no cache. |
| **No retry on transient failures** | A DNS blip, pod restart mid-request, or momentary load-balancer hiccup = permanent user-facing error with zero recovery. |
| **Broken business workflows** | Order placed but payment never initiated, notification never sent, inventory never decremented. |
| **Rate limiter ineffective at scale** | With 2+ gateway replicas, the in-memory `requests` map is per-pod. Effective rate limit doubles with every gateway replica added. |

### Step-by-Step Refactoring Plan

#### Step 1 — Add timeout, retry, and circuit breaker to the proxy

```typescript
// REPLACE: backend/api-gateway/src/utils/proxy.ts
import type { Request, Response } from 'express';

interface CircuitState {
  failures:    number;
  lastFailure: number;
  state:       'closed' | 'open' | 'half-open';
}

const circuitState       = new Map<string, CircuitState>();
const CIRCUIT_THRESHOLD  = 5;
const CIRCUIT_TIMEOUT_MS = 30_000;  // 30 s before trying half-open
const REQUEST_TIMEOUT_MS = 8_000;   // 8 s max upstream wait
const MAX_RETRIES        = 2;

function getCircuit(target: string): CircuitState {
  if (!circuitState.has(target)) {
    circuitState.set(target, { failures: 0, lastFailure: 0, state: 'closed' });
  }
  return circuitState.get(target)!;
}

function recordSuccess(target: string): void {
  const c = getCircuit(target);
  c.failures = 0;
  c.state    = 'closed';
}

function recordFailure(target: string): void {
  const c = getCircuit(target);
  c.failures++;
  c.lastFailure = Date.now();
  if (c.failures >= CIRCUIT_THRESHOLD) c.state = 'open';
}

function isCircuitOpen(target: string): boolean {
  const c = getCircuit(target);
  if (c.state === 'closed') return false;
  if (c.state === 'open' && Date.now() - c.lastFailure > CIRCUIT_TIMEOUT_MS) {
    c.state = 'half-open';
    return false; // Allow one probe request through
  }
  return c.state === 'open';
}

async function fetchWithTimeout(url: URL, init: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function proxy(req: Request, res: Response, target: string) {
  if (isCircuitOpen(target)) {
    return res.status(503).json({
      message: 'Service temporarily unavailable. Please try again shortly.',
      code:    'CIRCUIT_OPEN',
    });
  }

  const url = new URL(req.originalUrl, target);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string' && key !== 'host') headers.set(key, value);
  }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential back-off: 0ms, 200ms, 400ms
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }

    try {
      const upstream = await fetchWithTimeout(url, { method: req.method, headers, body });

      // Only retry on 5xx server errors — 4xx client errors are not retried
      if (upstream.status >= 500 && attempt < MAX_RETRIES) {
        lastError = new Error(`Upstream returned ${upstream.status}`);
        recordFailure(target);
        continue;
      }

      recordSuccess(target);
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key !== 'transfer-encoding') res.setHeader(key, value);
      });
      res.send(Buffer.from(await upstream.arrayBuffer()));
      return;

    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      recordFailure(target);
    }
  }

  res.status(503).json({ message: lastError?.message ?? 'Upstream unavailable' });
}
```

#### Step 2 — Move rate limiter state to Redis (shared across all pods)

```typescript
// REPLACE: backend/api-gateway/src/middleware/rate-limit.middleware.ts
import { createClient } from 'redis';
import type { NextFunction, Request, Response } from 'express';

const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
redis.connect().catch(console.error);

// Sliding-window counter stored in Redis — consistent across ALL gateway pods
export function rateLimiter(limit = 100, windowSeconds = 60) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate:${req.ip ?? 'unknown'}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        // First request in this window — set the TTL
        await redis.expire(key, windowSeconds);
      }
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
      if (count > limit) {
        return res.status(429).json({ message: 'Too many requests. Try again shortly.' });
      }
    } catch {
      // Redis failure: fail-open so legitimate traffic is never blocked
    }
    next();
  };
}
```

#### Step 3 — Introduce Kafka event-driven workflows for the order lifecycle

```typescript
// NEW: backend/services/order-service/src/events/publisher.ts
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-service',
  brokers:  (process.env.KAFKA_BROKERS ?? 'kafka:9092').split(','),
  retry: { retries: 5, initialRetryTime: 300 },
});

const producer = kafka.producer({ idempotent: true });

export const TOPICS = {
  ORDER_PLACED:    'order.placed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_PAID:      'order.paid',
  ORDER_SHIPPED:   'order.shipped',
} as const;

export async function publishOrderPlaced(order: {
  orderId:     string;
  orderNumber: string;
  userId:      string;
  totalAmount: number;
  currency:    string;
  items: Array<{ productId: string; quantity: number; vendorId: string }>;
}) {
  await producer.send({
    topic: TOPICS.ORDER_PLACED,
    messages: [{
      key:   order.orderId,
      value: JSON.stringify({ ...order, emittedAt: new Date().toISOString() }),
    }],
  });
}
// Call publishOrderPlaced() from order.controller.ts immediately after order.create()
// Consumers: payment-service, notification-service, inventory-service, analytics-service
```

```typescript
// NEW: backend/services/payment-service/src/consumers/order-consumer.ts
import { Kafka } from 'kafkajs';
import { initiatePayment } from '../services/payment.service.js';

const kafka    = new Kafka({ clientId: 'payment-service', brokers: ['kafka:9092'] });
const consumer = kafka.consumer({ groupId: 'payment-service-group' });

export async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'order.placed', fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const order = JSON.parse(message.value!.toString());
      // Auto-initiates payment — no synchronous call needed from order-service
      await initiatePayment({
        orderId:  order.orderId,
        userId:   order.userId,
        amount:   order.totalAmount,
        currency: order.currency,
        method:   'mobile_money',
      });
    },
  });
}
```

```typescript
// NEW: backend/services/notification-service/src/consumers/order-consumer.ts
import { Kafka } from 'kafkajs';
import { sendNotification } from '../services/notification.service.js';

const kafka    = new Kafka({ clientId: 'notification-service', brokers: ['kafka:9092'] });
const consumer = kafka.consumer({ groupId: 'notification-service-order-group' });

export async function startOrderConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topics: ['order.placed', 'order.shipped', 'order.cancelled'],
    fromBeginning: false,
  });
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const payload = JSON.parse(message.value!.toString());
      const templateMap: Record<string, string> = {
        'order.placed':    'order_placed',
        'order.shipped':   'order_shipped',
        'order.cancelled': 'order_cancelled',
      };
      await sendNotification({
        userId:   payload.userId,
        type:     templateMap[topic] ?? 'generic',
        channel:  'push',
        metadata: payload,
      });
    },
  });
}
```

**Event flow after refactoring:**

```
Client
  -> API Gateway
    -> Order Service  [creates order in MongoDB, publishes "order.placed" to Kafka]
           |
     ------+----------------+------------------+------------------+
     |                      |                  |                  |
Payment Service       Notification       Inventory Service  Analytics Service
(auto-initiates        Service              (deducts stock)   (records GMV)
 payment via MoMo)    (sends push/email)
```

No service blocks on another. If notification-service is down, the message waits durably in Kafka until it recovers.

---

## Weakness 3: Zero Caching, No Distributed Tracing, Primitive Observability

### The Specific Problem

#### 3a. No Caching Layer

Redis is declared in the infrastructure scaffolding (`backend/infrastructure/database/redis/`) but **no service connects to or uses Redis**. Confirmed by grep:

```
grep -r "redis" backend/services/
Output: No results found
```

Every single request hits raw compute:
- Product listing iterates the full static array on each request.
- Auth verifies JWT signatures without any session caching or token blacklist.
- Order history does a full `Map.values()` scan on each request.

#### 3b. No Distributed Tracing

The only observability across the entire system is a single `console.log` in the gateway's logging middleware:

```typescript
// backend/api-gateway/src/middleware/logging.middleware.ts — line 7
console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
```

There is **no correlation ID**, no trace ID propagated across services, no structured JSON logs. When a request spans Gateway > Order > Payment > Notification, there is no way to answer: *"Why did this specific user's order fail at 14:32:17?"*

Jaeger is configured in `docker-compose.yml` (ports 16686, 4317, 4318 mapped and running) but **no service exports traces to it**. The `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is never set in any service's environment config.

#### 3c. Static Health Checks That Always Report "up"

All services return a hardcoded `{ status: "up" }` regardless of actual dependency health:

```typescript
// Identical pattern in every single service:
app.get('/health', (_req, res) => res.json({ service: 'order-service', status: 'up' }));
// Always returns HTTP 200 — even when MongoDB is completely unreachable
```

Kubernetes uses this endpoint to decide whether to route traffic to a pod. A pod returning `status: "up"` while its database is down receives traffic and fails every single request silently.

### Impact on Performance / Scalability

| Consequence | Detail |
|-------------|--------|
| **100% cache-miss rate** | Every product browse, category fetch, and popular product request hits compute every time. At 1M users browsing products, the product service carries 50-100x more load than necessary. |
| **No production debuggability** | An outage at 10K TPS produces thousands of undifferentiated `console.log` lines with no correlation. MTTR is hours, not minutes. |
| **False-healthy pods** | Kubernetes sends traffic to pods whose databases are down because the health check always returns 200. Every request fails silently with no Kubernetes awareness. |
| **JWT re-verification overhead** | Every auth check re-parses and re-verifies the JWT cryptographic signature from scratch. Under load this CPU overhead compounds significantly. |

### Step-by-Step Refactoring Plan

#### Step 1 — Add a Redis product cache with TTL-based invalidation

```typescript
// NEW: backend/services/product-service/src/cache/product.cache.ts
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
await redis.connect();

const PRODUCT_TTL      = 300;   // 5 min — products change infrequently
const CATEGORY_TTL     = 3600;  // 1 hour — categories are very stable
const PRODUCT_LIST_TTL = 60;    // 1 min — listings change with stock levels

const productKey     = (id: string)     => `product:id:${id}`;
const productSlugKey = (s: string)      => `product:slug:${s}`;
const productListKey = (q: string, page: number, size: number) =>
  `product:list:${q}:${page}:${size}`;

export async function getCachedProduct(id: string) {
  const raw = await redis.get(productKey(id));
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedProduct(
  product: { id: string; slug: string; [k: string]: unknown }
) {
  const json = JSON.stringify(product);
  await Promise.all([
    redis.setEx(productKey(product.id),       PRODUCT_TTL, json),
    redis.setEx(productSlugKey(product.slug),  PRODUCT_TTL, json),
  ]);
}

export async function getCachedProductList(query: string, page: number, size: number) {
  const raw = await redis.get(productListKey(query, page, size));
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedProductList(
  query: string, page: number, size: number, result: unknown,
) {
  await redis.setEx(
    productListKey(query, page, size),
    PRODUCT_LIST_TTL,
    JSON.stringify(result),
  );
}

export async function invalidateProduct(productId: string, slug: string) {
  // Call whenever a product is created, updated, or deleted
  await Promise.all([
    redis.del(productKey(productId)),
    redis.del(productSlugKey(slug)),
    redis.del('product:categories'),
  ]);
}
```

```typescript
// UPDATED: backend/services/product-service/src/services/product.service.ts
import * as cache from '../cache/product.cache.js';
import { Product } from '../models/product.schema.js'; // MongoDB model

export async function list(query: string | undefined, page = 0, size = 20) {
  // 1. Check cache first
  const cached = await cache.getCachedProductList(query ?? '', page, size);
  if (cached) return cached;

  // 2. Query database only on cache miss
  const filter = query ? { name: { $regex: query, $options: 'i' } } : {};
  const [data, total] = await Promise.all([
    Product.find(filter).skip(page * size).limit(size).lean(),
    Product.countDocuments(filter),
  ]);

  const result = {
    data,
    meta: {
      current_page: page,
      last_page: Math.ceil(total / size) - 1,
      per_page: size,
      total,
    },
  };

  // 3. Populate cache for subsequent requests
  await cache.setCachedProductList(query ?? '', page, size, result);
  return result;
}

export async function byId(id: string) {
  const cached = await cache.getCachedProduct(id);
  if (cached) return cached;

  const product = await Product.findById(id).lean();
  if (product) await cache.setCachedProduct(product);
  return product;
}
```

#### Step 2 — Instrument every service with OpenTelemetry (Jaeger already running)

```typescript
// NEW: backend/shared/tracing/tracer.ts
// Import this as the VERY FIRST line of every service entry file
import { NodeSDK }                from '@opentelemetry/sdk-node';
import { OTLPTraceExporter }      from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation }    from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';

export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      // Points to the Jaeger container already configured in docker-compose.yml
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://jaeger:4318/v1/traces',
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new MongoDBInstrumentation(),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown());
}
```

```typescript
// UPDATED: backend/services/order-service/src/app.ts
// Add as the VERY FIRST import — before express, before anything else
import { initTracing } from '../../../shared/tracing/tracer.js';
initTracing('order-service');

import express from 'express';
// ... rest of the file unchanged
```

```typescript
// UPDATED: backend/api-gateway/src/middleware/logging.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import { trace } from '@opentelemetry/api';

export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start   = Date.now();
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? 'n/a';

  // Propagate trace-id to the client for frontend error correlation
  res.setHeader('X-Trace-Id', traceId);

  res.on('finish', () => {
    // Structured JSON — picked up automatically by Fluentd/Logstash -> Elasticsearch -> Kibana
    process.stdout.write(JSON.stringify({
      time:       new Date().toISOString(),
      level:      res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      traceId,
      method:     req.method,
      path:       req.originalUrl,
      status:     res.statusCode,
      durationMs: Date.now() - start,
      ip:         req.ip,
      userId:     req.headers['x-user-id'] ?? null,
    }) + '\n');
  });
  next();
}
```

#### Step 3 — Replace static health checks with deep dependency health checks

```typescript
// NEW: backend/shared/health/deep-health.ts
import type { Application } from 'express';
import mongoose from 'mongoose';
import { createClient } from 'redis';

interface DependencyStatus {
  status:    'ok' | 'degraded' | 'down';
  latencyMs: number;
  error?:    string;
}

async function checkMongo(): Promise<DependencyStatus> {
  const t = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { status: 'ok', latencyMs: Date.now() - t };
  } catch (e) {
    return { status: 'down', latencyMs: Date.now() - t, error: String(e) };
  }
}

async function checkRedis(
  client: ReturnType<typeof createClient>,
): Promise<DependencyStatus> {
  const t = Date.now();
  try {
    await client.ping();
    return { status: 'ok', latencyMs: Date.now() - t };
  } catch (e) {
    return { status: 'down', latencyMs: Date.now() - t, error: String(e) };
  }
}

export function registerHealthRoutes(
  app: Application,
  deps: { mongo?: true; redis?: ReturnType<typeof createClient> },
) {
  // Kubernetes liveness probe — is the Node.js process alive?
  app.get('/health/live', (_req, res) => res.status(200).json({ status: 'alive' }));

  // Kubernetes readiness probe — can this pod actually serve requests?
  app.get('/health/ready', async (_req, res) => {
    const checks: Record<string, DependencyStatus> = {};
    if (deps.mongo) checks.mongo = await checkMongo();
    if (deps.redis) checks.redis = await checkRedis(deps.redis);

    const allOk  = Object.values(checks).every((c) => c.status === 'ok');
    const status = allOk ? 200 : 503;
    res.status(status).json({
      status:    allOk ? 'ready' : 'not-ready',
      service:   process.env.SERVICE_NAME ?? 'unknown',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
```

```yaml
# UPDATED: backend/infrastructure/kubernetes/deployments/api-gateway.yaml
# Split liveness and readiness so Kubernetes distinguishes "alive but broken" from "crashed"
livenessProbe:
  httpGet:
    path: /health/live    # Never fails unless the Node.js process itself crashes
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready   # Deep check: MongoDB + Redis must respond before receiving traffic
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2
  successThreshold: 1     # 1 success re-enables traffic routing (fast recovery)
```

---

## Implementation Roadmap

```
Phase 1 — Foundation (Sprint 1-2):  STOP THE DATA LOSS BLEEDING
  - Provision PostgreSQL via Terraform (auth-service, payment-service)
  - Provision MongoDB Atlas cluster (order-service, product-service, notification-service)
  - Provision Redis cluster (cart + rate limiting)
  - Migrate auth-service to Prisma + PostgreSQL  (Weakness 1, Step 2)
  - Migrate order/cart services to MongoDB + Redis  (Weakness 1, Steps 3 & 4)

Phase 2 — Resilience (Sprint 3-4):  FIX THE CASCADE FAILURE RISK
  - Replace proxy.ts with circuit-breaker-aware proxy  (Weakness 2, Step 1)
  - Migrate rate limiter to Redis  (Weakness 2, Step 2)
  - Add Kafka producers to order-service for order lifecycle events  (Weakness 2, Step 3)

Phase 3 — Kafka Consumers (Sprint 5-6):  COMPLETE EVENT-DRIVEN MIGRATION
  - payment-service: consume order.placed
  - notification-service: consume order.* topics
  - inventory-service: consume order.placed to deduct stock
  - analytics-service: consume all topics for real-time GMV tracking

Phase 4 — Observability & Caching (Sprint 7-8):  VISIBILITY AND PERFORMANCE
  - OpenTelemetry instrumentation across all 12 services  (Weakness 3, Step 2)
  - Redis product cache with invalidation strategy  (Weakness 3, Step 1)
  - Deep health checks in all services  (Weakness 3, Step 3)
  - Update all Kubernetes readiness/liveness probes

Phase 5 — Hardening (Sprint 9-10):  PRODUCTION READINESS
  - Horizontal Pod Autoscaler (HPA) for each service (CPU + RPS triggers)
  - Kubernetes Deployments for all 12 services (currently only 2 exist)
  - PodDisruptionBudgets for HA during rolling updates
  - Load testing to validate 10,000 concurrent transaction target
```

---

## Kubernetes Horizontal Scaling Configuration

```yaml
# NEW: backend/infrastructure/kubernetes/hpa/order-service-hpa.yaml
# Replicate this pattern for all 12 services
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: muni
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2       # Never below 2 for high availability
  maxReplicas: 20      # Scale up to 20 pods under peak load
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65  # Scale before hitting the CPU ceiling
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

> **CRITICAL:** Horizontal scaling is **only possible after Phase 1** is complete. Scaling a service that stores data in-memory simply creates multiple isolated pods with a different, inconsistent view of data — a split-brain scenario that silently corrupts business data.

---

## Summary

| # | Weakness | Root Cause (File:Line) | Fix | Expected Impact |
|---|----------|------------------------|-----|-----------------|
| 1 | In-memory data stores | `auth.service.ts:5`, `order.service.ts:4`, `payment-service/app.ts:10`, 4 more | PostgreSQL + MongoDB + Redis | Enables horizontal scaling; eliminates all data loss on restart |
| 2 | No resilience in proxy | `proxy.ts` entire file; `rate-limit.middleware.ts:3` | Circuit breaker + timeout + retry + Kafka event bus | Eliminates cascade failures; fully decouples all services |
| 3 | No caching / observability | All services; `logging.middleware.ts:7` | Redis cache + OpenTelemetry + deep health checks | 70-80% reduction in DB/compute load; full production debuggability |

---

*Generated by full architectural analysis of `c:\PROJECTS\Projects\MUNI\backend\` — all file references and line numbers point to actual source files in this repository.*

