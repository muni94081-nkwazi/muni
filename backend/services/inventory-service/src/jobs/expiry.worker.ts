import { logger } from '../utils/logger.js';
import { Worker, Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

const connection = new IORedis(
  process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null },
);

const EXPIRY_QUEUE = 'inventory-expiry';

// A sweep that has been disabled for a while faces every reservation that ever
// expired, so the release runs in batches: one bounded transaction each rather
// than a single unbounded one holding row locks across the whole backlog.
const BATCH_SIZE = Math.max(1, Number(process.env.EXPIRY_SWEEP_BATCH_SIZE ?? 200));

// Belt-and-braces stop. Each batch deletes the rows it just read, so the loop
// always advances; this only bounds a pathological case rather than a real one.
const MAX_BATCHES = 10_000;

// Held so shutdown can close them; BullMQ keeps its Redis sockets open otherwise
// and SIGTERM would fall through to the force-exit timer.
let queueRef:  Queue  | null = null;
let workerRef: Worker | null = null;

export async function startExpiryWorker() {
  // Register the repeatable job (every 5 minutes)
  const queue = new Queue(EXPIRY_QUEUE, { connection });
  await queue.add(
    'sweep-expired-reservations',
    {},
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'expiry-sweep' },  // cron every 5 min
  );

  const worker = new Worker(
    EXPIRY_QUEUE,
    async () => {
      // Captured once: batches and the total below must agree on the cutoff,
      // and anything expiring mid-sweep belongs to the next tick.
      const now = new Date();

      const total = await prisma.inventoryReservation.count({
        where: { expiresAt: { lte: now } },
      });
      if (total === 0) return { released: 0 };

      let released = 0;
      let batch    = 0;

      while (batch < MAX_BATCHES) {
        // No skip/offset: each batch deletes what it reads, so the oldest
        // remaining rows are always the next page.
        const expired = await prisma.inventoryReservation.findMany({
          where:   { expiresAt: { lte: now } },
          orderBy: { expiresAt: 'asc' },
          take:    BATCH_SIZE,
        });

        if (expired.length === 0) break;
        batch++;

        await prisma.$transaction(async (tx) => {
          for (const res of expired) {
            await tx.$executeRaw`
              UPDATE "ProductVariant"
              SET reserved = GREATEST(0, reserved - ${res.quantity}), "updatedAt" = NOW()
              WHERE id = ${res.variantId}
            `;
          }
          await tx.inventoryReservation.deleteMany({
            where: { id: { in: expired.map((r) => r.id) } },
          });
        });

        released += expired.length;
        logger.info(`Swept ${released}/${total} expired reservations (batch ${batch})`);

        if (expired.length < BATCH_SIZE) break;
      }

      if (batch >= MAX_BATCHES) {
        logger.warn(`Stopped at the ${MAX_BATCHES}-batch cap with ${total - released} still expired; next tick continues.`);
      }

      return { released };
    },
    { connection },
  );

  worker.on('completed', (job, result) => {
    if ((result as { released: number }).released > 0) {
      logger.info(`Sweep complete — released ${(result as { released: number }).released} reservation(s)`);
    }
  });
  worker.on('failed', (_job, err) => logger.error('Failed', { detail: err.message }));

  queueRef  = queue;
  workerRef = worker;
  return worker;
}

/**
 * Close the worker, the repeatable-job queue and the shared Redis connection.
 * Safe to call when the worker was never started.
 */
export async function stopExpiryWorker(): Promise<void> {
  await Promise.allSettled([workerRef?.close(), queueRef?.close()]);
  workerRef = null;
  queueRef  = null;
  await connection.quit().catch(() => { /* already closed */ });
}
