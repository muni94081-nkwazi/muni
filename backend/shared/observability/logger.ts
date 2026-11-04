import { currentTraceContext } from '../tracing/tracer.js';

// ─── Structured logger ────────────────────────────────────────────────────────
//
// A minimal, dependency-free JSON logger for the services that were writing
// prefixed strings to the console. Those lines were unparseable by any log
// pipeline and carried no trace correlation, so a slow checkout could be seen
// in Jaeger but not tied to the log lines explaining it.
//
// Deliberately not winston: these services do not depend on it, and adding a
// dependency to get four log levels would be a poor trade. Services that
// already use winston get the same fields via `shared/tracing/winston-trace`.
//
// Shape matches the api-gateway's `structuredLog` so one parser handles both.

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

function thresholdFor(raw: string | undefined): number {
  const level = (raw ?? 'info').toUpperCase() as LogLevel;
  return LEVEL_ORDER[level] ?? LEVEL_ORDER.INFO;
}

export function createLogger(service: string): Logger {
  const threshold = thresholdFor(process.env.LOG_LEVEL);

  function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < threshold) return;

    const line = JSON.stringify({
      ts:      new Date().toISOString(),
      level,
      service,
      message,
      // Absent rather than null when nothing is sampled — a null traceId in a
      // log index is noise that looks like a dropped trace.
      ...currentTraceContext(),
      ...fields,
    });

    (level === 'ERROR' ? process.stderr : process.stdout).write(line + '\n');
  }

  return {
    debug: (m, f) => emit('DEBUG', m, f),
    info:  (m, f) => emit('INFO',  m, f),
    warn:  (m, f) => emit('WARN',  m, f),
    error: (m, f) => emit('ERROR', m, f),
  };
}
