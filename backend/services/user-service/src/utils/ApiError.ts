export interface ErrorDetail {
  field: string;
  message: string;
}

/**
 * Operational error carrying an HTTP status code, so the error handler
 * middleware can respond correctly without guessing.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly details?: ErrorDetail[];
  readonly isOperational = true;

  constructor(statusCode: number, message: string, details?: ErrorDetail[]) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: ErrorDetail[]): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message);
  }
}

export default ApiError;
