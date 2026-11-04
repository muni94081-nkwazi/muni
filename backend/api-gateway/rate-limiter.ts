import type { NextFunction, Request, Response } from 'express';

const requests = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(limit = 100, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const current = requests.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    requests.set(key, entry);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - entry.count));
    if (entry.count > limit) return res.status(429).json({ message: 'Too many requests. Try again shortly.' });
    next();
  };
}
