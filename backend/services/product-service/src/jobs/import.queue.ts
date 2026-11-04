import { Queue, QueueEvents } from 'bullmq';
// ioredis ships its class as a CJS export; the named `Redis` binding is the one
// usable as both a value and a type under NodeNext resolution.
import { Redis } from 'ioredis';

const QUEUE_NAME = 'product-import';

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,  // required by BullMQ
    });
  }
  return connection;
}

export let importQueue: Queue | null = null;

export function getImportQueue(): Queue {
  if (!importQueue) {
    importQueue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts:    3,
        backoff:     { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 24 * 60 * 60 },  // keep 24h
        removeOnFail:     { age: 7 * 24 * 60 * 60 }, // keep 7d
      },
    });
  }
  return importQueue;
}

export interface ImportJobPayload {
  importJobId: string;
  sellerId:    string;
  filePath:    string;
  format:      'CSV' | 'XLSX';
  fileName:    string;
}

export async function enqueueImport(payload: ImportJobPayload): Promise<string> {
  const queue = getImportQueue();
  const job = await queue.add('process-import', payload, {
    jobId: payload.importJobId,  // use DB id as job id for deduplication
  });
  return job.id!;
}

export async function closeImportQueue(): Promise<void> {
  await importQueue?.close();
  await connection?.quit();
}
