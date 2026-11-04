import cors from 'cors';
import type { CorsOptions, CorsOptionsDelegate } from 'cors';

// Allowed origins per environment
const PRODUCTION_ORIGINS = [
  'https://muni.ug',
  'https://www.muni.ug',
  'https://seller.muni.ug',
  'https://admin.muni.ug',
  'https://app.muni.ug',
];

const STAGING_ORIGINS = [
  'https://staging.muni.ug',
  'https://staging-seller.muni.ug',
  'https://staging-admin.muni.ug',
  ...PRODUCTION_ORIGINS,  // Allow prod domains in staging too
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:3000',
];

function getAllowedOrigins(): string[] {
  switch (process.env.NODE_ENV) {
    case 'production': return PRODUCTION_ORIGINS;
    case 'staging':    return [...STAGING_ORIGINS, ...DEV_ORIGINS];
    default:           return [...PRODUCTION_ORIGINS, ...STAGING_ORIGINS, ...DEV_ORIGINS];
  }
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(requestOrigin, callback) {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!requestOrigin) return callback(null, true);
      if (allowedOrigins.includes(requestOrigin)) {
        return callback(null, true);
      }
      // Allow *.muni.ug subdomains
      if (/^https:\/\/[a-z0-9-]+\.muni\.ug$/.test(requestOrigin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS policy: origin '${requestOrigin}' not allowed`));
    },
    credentials:     true,
    methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders:  ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID', 'X-API-Key'],
    exposedHeaders:  ['X-Correlation-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge:          86400,   // Cache preflight for 24 hours
    optionsSuccessStatus: 204,
  };
}

/** Use this in all microservices */
export const corsMiddleware = () => cors(createCorsOptions());
