import winston from 'winston';
import { traceContextFormat } from '../../../../shared/tracing/winston-trace.js';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    // First in the chain so traceId/spanId land on every line.
    traceContextFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'checkout-service' },
  transports: [new winston.transports.Console()],
});
