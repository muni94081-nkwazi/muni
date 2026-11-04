import type { NextFunction, Request, Response } from 'express';
import logger from '../config/logger.js';
import env from '../config/env.js';
import type { ApiError } from '../utils/ApiError.js';

export function errorHandler(
  err: Partial<ApiError> & Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const isOperational = err.isOperational ?? false;

  if (!isOperational) {
    logger.error('Unexpected error', err);
  }

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : 'Something went wrong. Please try again.',
    details: err.details,
    // Never leak stack traces outside development.
    stack: env.nodeEnv === 'development' ? err.stack : undefined,
  });
}

export default errorHandler;
