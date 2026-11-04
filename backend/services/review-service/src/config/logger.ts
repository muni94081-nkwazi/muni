import winston from 'winston';
import env from './env.js';

export const logger = winston.createLogger({
  level: env.nodeEnv === 'development' ? 'debug' : 'info',
  defaultMeta: { service: 'review-service' },
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export default logger;
