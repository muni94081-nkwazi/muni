import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import { apiRoutes, healthRoutes } from './routes/index.js';
import { attachIdentity } from './middleware/identity.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  // Closed by default. `origin: true` here would reflect whatever Origin the
  // request carried AND pair it with credentials:true — a combination the spec
  // forbids for `*` precisely because it lets any site read authenticated
  // responses. `false` sends no CORS headers, which is correct for a service
  // reached through the gateway; set CORS_ORIGINS to name real browser origins.
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : false, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/', healthRoutes);

  app.use(attachIdentity);
  app.use('/api/v1', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
