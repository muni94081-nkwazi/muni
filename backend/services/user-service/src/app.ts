import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import env from './config/env.js';
import { apiRoutes, healthRoutes } from './routes/index.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  // Closed by default. `origin: true` here would reflect whatever Origin the
  // request carried AND pair it with credentials:true — a combination the spec
  // forbids for `*` precisely because it lets any site read authenticated
  // responses. `false` sends no CORS headers, which is correct for a service
  // reached through the gateway; set CORS_ORIGINS to name real browser origins.
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

  // Health probes answer at the root so the container HEALTHCHECK and k8s
  // probes don't have to know the API version prefix.
  app.use('/', healthRoutes);

  // Everything else lives under the same /api/v1 prefix the rest of the
  // platform uses, because api-gateway forwards req.originalUrl unchanged.
  app.use('/api/v1', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
