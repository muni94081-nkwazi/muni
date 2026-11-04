import winston from 'winston';
import { currentTraceContext } from './tracer.js';

// ─── Winston ⇄ OpenTelemetry ──────────────────────────────────────────────────
//
// Stamps the active span's ids onto every log line, so a log entry and the
// trace it belongs to can be pivoted between: given a traceId from a log,
// Jaeger shows the whole request; given a slow span in Jaeger, the logs for
// that exact request are one search away.
//
// Implemented as a winston format rather than at each call site so it cannot
// be forgotten — a logger that carries trace ids on only some of its lines is
// worse than one that carries none, because the gaps look like missing traces.

export const traceContextFormat = winston.format((info) => {
  const ctx = currentTraceContext();
  if (ctx.traceId) {
    info.traceId = ctx.traceId;
    info.spanId  = ctx.spanId;
  }
  return info;
});
