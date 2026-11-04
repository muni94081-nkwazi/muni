import type { NextFunction, Request, Response } from 'express';
import logger from '../config/logger.js';
import env from '../config/env.js';
import type { ApiError } from '../utils/ApiError.js';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(Object.assign(new Error(`Route not found: ${req.method} ${req.originalUrl}`), {
    statusCode: 404,
    isOperational: true,
  }));
}

export function errorHandler(
  err: Partial<ApiError> & Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  if (!err.isOperational) logger.error('Unexpected error', { message: err.message, stack: err.stack });

  res.status(statusCode).json({
    success: false,
    message: err.isOperational ? err.message : 'Something went wrong. Please try again.',
    details: err.details,
    stack: env.nodeEnv === 'development' ? err.stack : undefined,
  });
}
