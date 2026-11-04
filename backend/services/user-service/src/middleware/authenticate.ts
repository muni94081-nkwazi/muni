import type { NextFunction, Request, Response } from 'express';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Verifies the Bearer access token on protected routes and attaches the
 * decoded payload to req.user. This service issues its own tokens, but in
 * front of api-gateway you may instead want the gateway to verify tokens
 * once and forward a trusted header — this middleware still works standalone
 * if user-service is ever called directly.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization ?? '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}

export default authenticate;
