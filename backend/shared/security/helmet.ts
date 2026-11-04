import helmet from 'helmet';
import type { Application } from 'express';

/**
 * Apply production-grade Helmet security headers to an Express app.
 * Configure once in shared, use everywhere:
 *   import { applyHelmet } from '@muni/shared/security/helmet.js';
 *   applyHelmet(app);
 */
export function applyHelmet(app: Application): void {
  app.use(helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],  // needed for some API docs
        imgSrc:         ["'self'", 'data:', 'https://cdn.muni.ug'],
        connectSrc:     ["'self'", 'https://api.muni.ug'],
        fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
        objectSrc:      ["'none'"],
        mediaSrc:       ["'self'", 'https://cdn.muni.ug'],
        frameSrc:       ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // HTTP Strict Transport Security: 1 year, include subdomains
    hsts: {
      maxAge:            31536000,  // 1 year in seconds
      includeSubDomains: true,
      preload:           true,
    },
    // Prevent browsers from sniffing content type
    noSniff: true,
    // Deny iframes (clickjacking protection)
    frameguard: { action: 'deny' },
    // Remove X-Powered-By: Express
    hidePoweredBy: true,
    // Cross-Origin-Opener-Policy
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: { policy: 'cross-origin' },  // needed for CDN
    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Permissions Policy (replaces Feature-Policy)
    // Note: helmet doesn't have built-in permissionsPolicy, set via middleware below
    xssFilter: true,  // X-XSS-Protection
    dnsPrefetchControl: { allow: false },
  }));

  // Set Permissions-Policy header (not yet in helmet)
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy',
      'camera=(), microphone=(), geolocation=(self), payment=(self)');
    next();
  });
}

/** Lighter helmet for internal/backend-only services that don't serve HTML */
export function applyApiHelmet(app: Application): void {
  app.use(helmet({
    contentSecurityPolicy: false,  // APIs don't serve HTML
    hsts: { maxAge: 31536000, includeSubDomains: true },
    noSniff: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    xssFilter: true,
  }));
}
