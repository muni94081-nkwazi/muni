import type { Request, Response, NextFunction } from 'express';

/**
 * Recursively sanitize a value: trim strings, strip dangerous HTML chars.
 * Does NOT use external libraries to avoid supply-chain risk.
 * For rich text input, use a dedicated sanitizer like DOMPurify on the client.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .trim()
      // Remove null bytes (common in injection attacks)
      .replace(/\0/g, '')
      // Encode script tags
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      // Encode common XSS patterns
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');  // onload=, onclick=, etc.
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Block MongoDB operator injection: keys starting with $
      if (k.startsWith('$') || k.includes('.')) continue;
      sanitized[k] = sanitizeValue(v);
    }
    return sanitized;
  }
  return value;
}

/**
 * Express middleware: sanitize req.body, req.query, req.params.
 * Mutates in-place for performance.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body)   req.body   = sanitizeValue(req.body);
  if (req.query)  req.query  = sanitizeValue(req.query) as typeof req.query;
  if (req.params) req.params = sanitizeValue(req.params) as typeof req.params;
  next();
}

/**
 * Validate Content-Type for POST/PUT/PATCH requests.
 * Reject requests claiming to be JSON but with incorrect content-type.
 */
export function validateContentType(req: Request, res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] ?? '';
    if (req.body && Object.keys(req.body).length > 0 && !ct.includes('application/json') && !ct.includes('multipart/form-data')) {
      res.status(415).json({
        success: false,
        error:   'Unsupported Media Type: expected application/json',
        data:    null,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }
  next();
}

/**
 * Block requests with suspicious patterns (basic WAF).
 * Does not replace a real WAF but catches the most common probes.
 */
export function basicWafMiddleware(req: Request, res: Response, next: NextFunction): void {
  const suspicious = [
    /\.\.\/\.\./,                    // Path traversal
    /\/etc\/passwd/i,                // File disclosure
    /<script/i,                       // XSS
    /UNION\s+SELECT/i,               // SQL injection
    /exec\s*\(/i,                    // Command injection
    /eval\s*\(/i,                    // JS injection
    /base64_decode\s*\(/i,           // PHP webshell
    /\/wp-admin/i,                   // WordPress scan
    /\/phpmyadmin/i,                 // phpMyAdmin scan
  ];

  const urlToCheck = decodeURIComponent(req.originalUrl);
  for (const pattern of suspicious) {
    if (pattern.test(urlToCheck)) {
      res.status(400).json({
        success: false,
        error:   'Bad Request',
        data:    null,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }
  next();
}
