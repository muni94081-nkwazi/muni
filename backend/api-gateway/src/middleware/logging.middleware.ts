import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { currentTraceContext } from '../../../shared/tracing/tracer.js';

// ─── Request Logger with Correlation IDs ──────────────────────────────────────
//
// Replaces the stub logging.middleware.ts with a production-ready logger.
//
// What it does:
//   1. Assigns a unique correlationId to EVERY request (UUID v4 unless the
//      caller already sent x-correlation-id / x-request-id).
//   2. Stamps the id into BOTH upstream request headers (so downstream services
//      can log with the same ID) AND the outgoing response header.
//   3. Emits one structured-JSON log line on ARRIVAL and one on COMPLETION,
//      capturing method, path, status, duration, userId, IP, and user-agent.
//   4. Skips noisy health/probe paths to keep log volume sane.
//
// Log format: one-line JSON → stream to stdout (for Fluentd / CloudWatch / etc.)
//
// Example log line:
//   {"ts":"2024-01-01T00:00:00.000Z","level":"INFO","service":"api-gateway",
//    "event":"request_completed","correlationId":"…","method":"GET",
//    "path":"/api/v1/products","status":200,"durationMs":42,"userId":"usr_…"}

// Paths that generate too much noise — suppress per-request logging
const SILENT_PATHS = new Set(['/health', '/health/live', '/health/ready', '/favicon.ico']);

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // ── 1. Resolve / generate correlation ID ─────────────────────────────────
  const correlationId: string =
    (req.headers['x-correlation-id'] as string | undefined) ??
    (req.headers['x-request-id']     as string | undefined) ??
    randomUUID();

  // Stamp into request headers so proxy.ts forwards them downstream
  req.headers['x-correlation-id'] = correlationId;
  req.headers['x-request-id']     = correlationId;

  // Return to the caller so browser / mobile can correlate error reports
  res.setHeader('X-Correlation-ID', correlationId);

  const path = req.path;
  if (SILENT_PATHS.has(path)) return next();

  // ── 2. Log arrival ────────────────────────────────────────────────────────
  const startMs = Date.now();
  structuredLog('INFO', {
    event:         'request_received',
    correlationId,
    method:        req.method,
    path:          req.originalUrl,
    ip:            req.ip ?? req.socket.remoteAddress,
    userId:        req.headers['x-user-id']    as string | undefined,
    userRoles:     req.headers['x-user-roles'] as string | undefined,
    userAgent:     req.headers['user-agent'],
    contentLength: req.headers['content-length'],
  });

  // ── 3. Log completion ─────────────────────────────────────────────────────
  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const level = res.statusCode >= 500 ? 'ERROR'
                : res.statusCode >= 400 ? 'WARN'
                : 'INFO';

    structuredLog(level, {
      event:        'request_completed',
      correlationId,
      method:       req.method,
      path:         req.originalUrl,
      status:       res.statusCode,
      durationMs,
      userId:       req.headers['x-user-id'] as string | undefined,
      ip:           req.ip ?? req.socket.remoteAddress,
    });
  });

  next();
}

// ─── Shared structured logger ─────────────────────────────────────────────────

type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export function structuredLog(level: Level, fields: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts:      new Date().toISOString(),
    level,
    service: 'api-gateway',
    // Correlates this line with the distributed trace. `correlationId` already
    // threads a request across services, but only traceId links it to the
    // spans in Jaeger — given one you can jump straight to the other.
    //
    // Spread empty when nothing is sampled, so the keys are simply absent
    // rather than present-and-null.
    ...currentTraceContext(),
    ...fields,
  });
  (level === 'ERROR' ? process.stderr : process.stdout).write(line + '\n');
}
