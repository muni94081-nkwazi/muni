import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/prisma.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import { startSlaSweeper, stopSlaSweeper } from './services/ticket.service.js';

async function main(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('database connected');
  } catch (err) {
    logger.error('database unavailable — exiting', { error: (err as Error).message });
    process.exit(1);
  }

  // Events notify the requester that an agent replied; degraded without Kafka,
  // but tickets still work.
  await connectProducer().catch((err: Error) =>
    logger.warn('Kafka producer unavailable — support events will be dropped', { error: err.message }),
  );

  startSlaSweeper();

  const server = app.listen(env.port, () => {
    logger.info(`support-service listening on port ${env.port} (${env.nodeEnv})`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down`);
    stopSlaSweeper();
    await disconnectProducer().catch(() => undefined);
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
