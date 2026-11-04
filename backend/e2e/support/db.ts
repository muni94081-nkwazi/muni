import { execFileSync } from 'node:child_process';

// ─── Database access ──────────────────────────────────────────────────────────
//
// Two things this suite needs that no API can do:
//
//   1. Create the first admin. auth-service deliberately exposes no endpoint
//      that grants ROLE_ADMIN — see scripts/promote-admin.sh, which says so —
//      and no seed creates one. The only route in is the database.
//   2. Clean up afterwards. Orders, payments, escrow holds, carts and
//      reservations have no delete endpoints, by design.
//
// Both go through `docker compose exec` rather than a Postgres/Mongo driver:
// neither `pg` nor `mongodb` is in the monorepo and this suite may not add
// dependencies. The containers already have psql and mongosh, and the stack is
// running anyway — that is the whole premise of the test.

const COMPOSE_ARGS = ['compose', '--profile', 'services'];

// Local dev credentials, matching docker-compose.yml's defaults. Read from the
// environment so a stack brought up with different ones still works, and so no
// credential is written into the test code.
const PG_USER = process.env.POSTGRES_USER ?? 'muni';
const MONGO_USER = process.env.MONGO_INITDB_ROOT_USERNAME ?? 'muni';
const MONGO_PASSWORD = process.env.MONGO_INITDB_ROOT_PASSWORD ?? 'muni_secret';

function run(args: string[], input?: string): string {
  try {
    return execFileSync('docker', args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    });
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string };
    throw new Error(
      `[e2e:db] docker ${args.join(' ')} failed:\n` +
      `  stderr: ${e.stderr ?? '(none)'}\n` +
      `  stdout: ${e.stdout ?? '(none)'}\n` +
      `  ${e.message}`,
    );
  }
}

/** Run SQL against one of the Postgres databases. */
export function psql(database: string, sql: string): string {
  return run(
    [...COMPOSE_ARGS, 'exec', '-T', 'postgres',
     'psql', '-U', PG_USER, '-d', database, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
  );
}

/** Run a JS expression against the orders database in Mongo. */
export function mongo(js: string): string {
  return run(
    [...COMPOSE_ARGS, 'exec', '-T', 'mongo',
     'mongosh',
     `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/muni_orders?authSource=admin`,
     '--quiet', '--eval', js],
  );
}

/**
 * Grant ROLE_ADMIN + ROLE_SUPER_ADMIN to an already-registered user.
 *
 * Mirrors scripts/promote-admin.sh. SUPER_ADMIN as well as ADMIN because
 * assigning roles through the panel is super-admin-only (see auth-service's
 * PUT /admin/staff/:userId/role).
 */
export function promoteToAdmin(email: string): void {
  psql(
    'muni_auth',
    `UPDATE users
        SET roles = ARRAY['ROLE_CUSTOMER','ROLE_ADMIN','ROLE_SUPER_ADMIN']
      WHERE email = '${email.replace(/'/g, "''")}';`,
  );
}

/**
 * Reset the transactional tables between runs.
 *
 * Users and products are deliberately NOT truncated: seeding a seller, getting
 * them verified, creating a product and getting it moderated is slow and the
 * suite reuses them across runs.
 *
 * Inventory is restored rather than deleted — the variant rows belong to the
 * seeded product, so the stock counters are reset instead.
 */
export function resetTransactionalData(): void {
  // Orders live in Mongo.
  mongo('db.orders.deleteMany({}); db.counters.deleteMany({});');

  // Payments, escrow, vendor balances and the ledger.
  psql(
    'muni_payment',
    `TRUNCATE TABLE escrow_holds,
                    vendor_ledger_entries,
                    vendor_payouts,
                    vendor_balances,
                    platform_commission_entries,
                    payment_transactions,
                    processed_webhooks
       RESTART IDENTITY CASCADE;`,
  );

  // Inventory reservations, and the counters they move.
  psql(
    'muni_products',
    `DELETE FROM "InventoryReservation";
     UPDATE "ProductVariant" SET reserved = 0;`,
  );
}

/**
 * The provider-facing reference for a checkout session's payment.
 *
 * Needed because the confirmation webhook resolves a payment by `reference`
 * (`findByReference(externalId)`), and no API exposes it: the checkout session
 * returns `paymentIntentId`, which is the `paymentId` — a different column —
 * and order-service stores `paymentReference: null` at creation. See the BUG
 * note at the webhook step in checkout.flow.test.ts.
 *
 * Keyed on the CHECKOUT SESSION id, not the order id: the saga passes
 * `orderId: session.id` when it charges, so that is what lands in the
 * payment's `order_id`.
 */
export function paymentReferenceForSession(sessionId: string): string {
  const out = psql(
    'muni_payment',
    `SELECT reference FROM payment_transactions
      WHERE order_id = '${sessionId.replace(/'/g, "''")}'
      ORDER BY created_at DESC
      LIMIT 1;`,
  ).trim();

  if (!out) {
    throw new Error(`[e2e] no payment_transactions row for checkout session ${sessionId}`);
  }
  return out;
}

/** Cart lives in Redis, keyed by identity. */
export function clearCart(userId: string): void {
  run([...COMPOSE_ARGS, 'exec', '-T', 'redis', 'redis-cli', 'DEL', `cart:${userId}`]);
}

/** Put a variant's stock back to a known quantity. */
export function setVariantStock(variantId: string, stock: number): void {
  psql(
    'muni_products',
    `UPDATE "ProductVariant"
        SET stock = ${Number(stock)}, reserved = 0
      WHERE id = '${variantId.replace(/'/g, "''")}';`,
  );
}

/** True when the stack looks up — used to skip rather than fail confusingly. */
export function stackIsUp(): boolean {
  try {
    run([...COMPOSE_ARGS, 'ps', '--status', 'running', '--format', '{{.Name}}']);
    return true;
  } catch {
    return false;
  }
}
