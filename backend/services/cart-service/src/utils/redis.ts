import { Redis } from 'ioredis';
import { logger } from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisClient {
  private static instance: Redis;

  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });

      RedisClient.instance.on('error', (err: Error) => {
        logger.error('Redis error', { error: err });
      });

      RedisClient.instance.on('connect', () => {
        logger.info('Connected to Redis');
      });
    }
    return RedisClient.instance;
  }
}

export const redis = RedisClient.getInstance();
