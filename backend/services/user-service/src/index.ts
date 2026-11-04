import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/prisma.js';
import { connectProducer, disconnectProducer } from './config/kafka.js';

async function main(): Promise<void> {
  // Kafka is optional: events are fire-and-forget, so a broker that is slow to
  // come up in compose must not stop the service from accepting logins.
  try {
    await connectProducer();
  } catch (err) {
    logger.error('Kafka producer unavailable — continuing without event publishing', err);
  }

  const server = app.listen(env.port, () => {
    logger.info(`listening on port ${env.port} (${env.nodeEnv})`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`received ${signal}, shutting down gracefully`);
    server.close(async () => {
      await disconnectProducer();
      await prisma.$disconnect();
      process.exit(0);
    });

    // Force exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start user-service', err);
  process.exit(1);
});
