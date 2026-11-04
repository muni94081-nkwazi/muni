import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route/controller function so thrown errors and rejected
 * promises are forwarded to next(err) instead of crashing the process or
 * being silently swallowed.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
