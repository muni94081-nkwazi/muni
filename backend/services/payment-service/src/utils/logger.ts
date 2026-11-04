import winston from 'winston';
import { traceContextFormat } from '../../../../shared/tracing/winston-trace.js';
import { env } from '../config/env.js';

export const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(traceContextFormat(), winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'payment-service' },
  transports: [new winston.transports.Console()],
});
