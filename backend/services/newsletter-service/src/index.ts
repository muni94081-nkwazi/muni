import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/prisma.js';

async function main(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('database connected');
  } catch (err) {
    logger.error('database unavailable — exiting', { error: (err as Error).message });
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`newsletter-service listening on port ${env.port} (${env.nodeEnv})`, {
      optIn: env.singleOptIn ? 'single' : 'double',
    });
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down`);
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
