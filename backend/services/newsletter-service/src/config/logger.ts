import winston from 'winston';
import env from './env.js';

export const logger = winston.createLogger({
  level: env.nodeEnv === 'development' ? 'debug' : 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'newsletter-service' },
  transports: [new winston.transports.Console()],
});

export default logger;
