import type { NextFunction, Request, Response } from 'express';

// ─── Standardised Response Envelope ──────────────────────────────────────────
//
// Every JSON response leaving the gateway is wrapped in:
//
//   {
//     "success":   true | false,
//     "data":      <original response body> | null,
//     "error":     null | { "code": string, "message": string },
//     "meta":      { "correlationId": string, "timestamp": string, "service": string }
//   }
//
// How it works:
//   • Intercepts res.json() before it writes to the socket.
//   • Skips wrapping if the upstream already sent a structured envelope
//     (detected by checking for { success, data } or { error } keys).
//   • Skips wrapping for non-JSON content-types and streaming responses.
//   • Maps HTTP status → success: true/false automatically.
//   • Unwraps nested { message } error bodies into the error field.
//
// Paths excluded from wrapping (internal / health):
//   /health, /health/live, /health/ready, /internal/metrics

const SKIP_PATHS_RE = /^\/health|^\/internal\//;

// Fields that indicate the body is already a gateway-shaped envelope
const ENVELOPE_KEYS = new Set(['success', 'data', 'error', 'meta']);

function isAlreadyWrapped(body: Record<string, unknown>): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  // If the body already has at least 2 of our envelope keys, skip wrapping
  return keys.filter((k) => ENVELOPE_KEYS.has(k)).length >= 2;
}

export function responseTransformer(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SKIP_PATHS_RE.test(req.path)) return next();

  // Save the original json method
  const originalJson = res.json.bind(res);

  // Override res.json
  res.json = function (body: unknown): Response {
    // Don't transform non-object bodies or already-wrapped responses
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      isAlreadyWrapped(body as Record<string, unknown>)
    ) {
      // Still wrap arrays and primitives but let envelope objects pass through
      if (typeof body === 'object' && !Array.isArray(body) && isAlreadyWrapped(body as Record<string, unknown>)) {
        return originalJson(body);
      }
    }

    const status   = res.statusCode;
    const success  = status < 400;
    const rawBody  = body as Record<string, unknown> | unknown[] | null;

    // Skip already-wrapped envelopes
    if (!Array.isArray(rawBody) && rawBody !== null && typeof rawBody === 'object' && isAlreadyWrapped(rawBody as Record<string, unknown>)) {
      return originalJson(rawBody);
    }

    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ??
      res.getHeader('X-Correlation-ID') as string | undefined;

    let data: unknown = success ? rawBody : null;
    let error: { code: string; message: string } | null = null;

    if (!success && rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
      const b = rawBody as Record<string, unknown>;
      error = {
        code:    (b.code    as string | undefined) ?? httpCodeName(status),
        message: (b.message as string | undefined) ?? (b.error as string | undefined) ?? 'An error occurred',
      };
      data = null;
    } else if (!success) {
      error = { code: httpCodeName(status), message: 'An error occurred' };
      data  = null;
    }

    const envelope = {
      success,
      data,
      error,
      meta: {
        correlationId: correlationId ?? null,
        timestamp:     new Date().toISOString(),
        service:       'api-gateway',
      },
    };

    return originalJson(envelope);
  };

  next();
}

// ─── HTTP status → error code name ───────────────────────────────────────────

function httpCodeName(status: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    408: 'REQUEST_TIMEOUT',
    409: 'CONFLICT',
    410: 'GONE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT',
  };
  return codes[status] ?? `HTTP_${status}`;
}
