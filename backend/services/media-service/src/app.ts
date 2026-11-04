import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import mediaRoutes from './routes/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 4018;

app.use(internalCors());
app.use(express.json());

// Health checks
app.get('/health', (_req, res) => { res.json({ service: 'media-service', status: 'up' }); });
app.get('/health/live', (_req, res) => { res.json({ service: 'media-service', status: 'up' }); });
app.get('/health/ready', (_req, res) => { res.json({ service: 'media-service', ready: true }); });

// Serve static files for local storage.
//
// Mounted twice, at the same directory. `/uploads` is the original path and
// stays for anything inside the mesh that already uses it.
//
// `/api/v1/media/uploads` is the path a browser can actually reach. The gateway
// forwards req.originalUrl verbatim, so a public URL has to be one this service
// answers under the gateway's own prefix — and going through the gateway is
// what lets an image be fetched without publishing this service's port. The
// previous public URL was http://localhost:4018/uploads/<file>, which resolves
// only on the host running the container.
if (process.env.STORAGE_PROVIDER !== 's3') {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
  const serveUploads = express.static(uploadDir, {
    // Content-addressed filenames, so a cached image is never the wrong image.
    maxAge: '30d',
    immutable: true,
    // A missing image is a 404, not a fall-through to the JSON error handler.
    fallthrough: false,
  });

  app.use('/uploads', serveUploads);
  app.use('/api/v1/media/uploads', serveUploads);
}

app.use('/api/v1/media', mediaRoutes);

app.use((error: Error & { status?: number; issues?: unknown }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.name === 'ZodError') {
    res.status(422).json({ message: 'Validation failed', issues: error.issues });
    return;
  }
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

const server = app.listen(port, () => {
  logger.info(`media-service listening on port ${port}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
