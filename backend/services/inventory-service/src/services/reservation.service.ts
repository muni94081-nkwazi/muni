import { addMinutes } from 'date-fns';
import type { PrismaClient } from '../generated/prisma/index.js';

// ─── Inventory Reservation ────────────────────────────────────────────────────
//
// Extracted from index.ts so the concurrency behaviour can actually be tested
// against the real implementation rather than a re-typed copy of it.
//
// ── Why not SELECT … FOR UPDATE ──────────────────────────────────────────────
//
// The original did: lock the row, compute `stock - reserved` in JavaScript,
// UPDATE, run a correlated OUT_OF_STOCK update with three subqueries, INSERT
// the reservation — all inside one transaction holding an exclusive row lock.
// Correct, but on a flash-sale variant every buyer serialises on that lock.
// At ~3–5ms held per reservation that caps the variant at 200–300/second no
// matter how many pods run, and the rest queue until the connection pool
// drains and unrelated queries start failing.
//
// A single conditional UPDATE is equally safe and orders of magnitude cheaper:
// Postgres takes the row lock for the write itself, and the `stock - reserved
// >= quantity` predicate is evaluated under that lock. There is no window
// between check and write to lose. Zero rows updated ⇒ not enough stock.

export const SERIALIZATION_FAILURE = '40001';
export const DEADLOCK_DETECTED     = '40P01';

const MAX_RETRIES = 3;

export interface ReservationResult {
  id:        string;
  expiresAt: Date;
}

export class VariantNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('Variant not found'); this.name = 'VariantNotFoundError'; }
}

export class InsufficientStockError extends Error {
  readonly status = 409;
  constructor(readonly available: number) {
    super(`Insufficient stock: only ${available} unit${available === 1 ? '' : 's'} available`);
    this.name = 'InsufficientStockError';
  }
}

export interface ReserveParams {
  variantId:  string;
  quantity:   number;
  sessionId:  string;
  userId?:    string;
  ttlMinutes: number;
}

/** Sleep helper — separated so tests can run without real timers. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function reserveInventory(
  prisma: PrismaClient,
  params: ReserveParams,
): Promise<ReservationResult> {
  let attempt = 0;

  for (;;) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Atomic claim: the predicate IS the lock.
        const claimed = await tx.$queryRaw<Array<{ remaining: number; productId: string }>>`
          UPDATE "ProductVariant"
          SET    reserved = reserved + ${params.quantity}, "updatedAt" = NOW()
          WHERE  id = ${params.variantId}
            AND  active = true
            AND  stock - reserved >= ${params.quantity}
          RETURNING stock - reserved AS remaining, "productId"
        `;

        if (claimed.length === 0) {
          // Nothing claimed — separate "no such variant" from "sold out" so
          // the caller can tell a 404 from a 409.
          const existing = await tx.$queryRaw<Array<{ available: number }>>`
            SELECT stock - reserved AS available
            FROM   "ProductVariant"
            WHERE  id = ${params.variantId} AND active = true
          `;

          if (existing.length === 0) throw new VariantNotFoundError();
          throw new InsufficientStockError(Number(existing[0].available));
        }

        const reservation = await tx.inventoryReservation.create({
          data: {
            variantId:  params.variantId,
            userId:     params.userId,
            sessionId:  params.sessionId,
            quantity:   params.quantity,
            expiresAt:  addMinutes(new Date(), params.ttlMinutes),
          },
        });

        return {
          id:        reservation.id,
          expiresAt: reservation.expiresAt,
          productId: claimed[0].productId,
          remaining: Number(claimed[0].remaining),
        };
      }, {
        // Read Committed suffices: the conditional UPDATE re-reads the latest
        // committed row under its own lock, so a concurrent writer cannot slip
        // between check and write. Serializable would add retries, not safety.
        isolationLevel: 'ReadCommitted',
        timeout: 5_000,
      });

      // Derived state — deliberately outside the transaction so it never
      // extends the row lock the money path depends on.
      if (result.remaining === 0) {
        await markProductOutOfStock(prisma, result.productId).catch(() => { /* non-fatal */ });
      }

      return { id: result.id, expiresAt: result.expiresAt };

    } catch (err) {
      // Business outcomes are terminal — only transient conflicts retry.
      if (err instanceof VariantNotFoundError || err instanceof InsufficientStockError) throw err;

      const code = (err as { code?: string }).code;
      const transient = code === DEADLOCK_DETECTED || code === SERIALIZATION_FAILURE;

      if (!transient || attempt >= MAX_RETRIES) throw err;

      // Jittered exponential backoff. The saga sorts variant ids so lock order
      // is consistent across carts, which removes the common deadlock; this
      // covers the residual window and any caller that does not sort.
      await delay(20 * 2 ** attempt + Math.random() * 20);
      attempt++;
    }
  }
}

/**
 * Flip a product back to ACTIVE once some variant has sellable stock again.
 *
 * The inverse of `markProductOutOfStock`, and it did not exist. A product went
 * OUT_OF_STOCK the moment its last unit was merely RESERVED, and nothing ever
 * moved it back — not when the hold was released, not when the order was
 * cancelled and the stock returned, not when the seller restocked. Stock sat on
 * the shelf against a product the storefront had stopped offering.
 *
 * Guarded on `status = 'OUT_OF_STOCK'` so it can only ever undo that one
 * automatic transition: a DRAFT, ARCHIVED, REJECTED or PENDING_APPROVAL product
 * is not published by a stock movement.
 */
export async function restoreProductAvailability(prisma: PrismaClient, productId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Product"
    SET    status = 'ACTIVE'
    WHERE  id = ${productId}
      AND  status = 'OUT_OF_STOCK'
      AND  EXISTS (
        SELECT 1 FROM "ProductVariant"
        WHERE "productId" = ${productId}
          AND active = true
          AND stock - reserved > 0
      )
  `;
}

/** Flip a product to OUT_OF_STOCK once no active variant has sellable stock. */
export async function markProductOutOfStock(prisma: PrismaClient, productId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Product"
    SET    status = 'OUT_OF_STOCK'
    WHERE  id = ${productId}
      AND  status = 'ACTIVE'
      AND  NOT EXISTS (
        SELECT 1 FROM "ProductVariant"
        WHERE "productId" = ${productId}
          AND active = true
          AND stock - reserved > 0
      )
  `;
}
