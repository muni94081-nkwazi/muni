import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import logger from './config/logger.js';
import { apiRoutes, healthRoutes } from './routes/index.js';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  // Closed by default. `origin: true` here would reflect whatever Origin the
  // request carried AND pair it with credentials:true — a combination the spec
  // forbids for `*` precisely because it lets any site read authenticated
  // responses. `false` sends no CORS headers, which is correct for a service
  // reached through the gateway; set CORS_ORIGINS to name real browser origins.
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : false, credentials: true }));
  // Small on purpose: the only body this service accepts is an email address.
  app.use(express.json({ limit: '16kb' }));

  // req.ip must reflect the original client, not the gateway hop — the signup
  // rate limiter buckets on it.
  app.set('trust proxy', true);

  app.use('/', healthRoutes);
  app.use('/api/v1', apiRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });

  app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // The message is logged, never returned: an unexpected error here carries
    // Prisma/driver detail that must not reach a public caller.
    logger.error('unhandled error', { error: error.message, stack: error.stack });
    res.status(error.status ?? 500).json({
      success: false,
      message: 'Something went wrong. Please try again.',
    });
  });

  return app;
}

export const app = createApp();
export default app;
