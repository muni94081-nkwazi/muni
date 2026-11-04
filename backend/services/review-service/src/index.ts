import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/prisma.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import { startOrderConsumer, stopOrderConsumer } from './consumers/order.consumer.js';

async function main(): Promise<void> {
  // The database is required: without it there is nothing to serve, and
  // starting anyway would reproduce the in-memory behaviour this replaces.
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('database connected');
  } catch (err) {
    logger.error('database unavailable — exiting', { error: (err as Error).message });
    process.exit(1);
  }

  // Kafka is optional. Without the producer, downstream consumers miss review
  // events; without the consumer, the verified-purchase check falls back to
  // querying order-service directly. Both degrade, neither blocks reviews.
  await connectProducer().catch((err: Error) =>
    logger.warn('Kafka producer unavailable — review events will be dropped', { error: err.message }),
  );
  await startOrderConsumer();

  const server = app.listen(env.port, () => {
    logger.info(`review-service listening on port ${env.port} (${env.nodeEnv})`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down`);
    await Promise.allSettled([stopOrderConsumer(), disconnectProducer()]);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
