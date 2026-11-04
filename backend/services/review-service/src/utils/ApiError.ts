export interface ErrorDetail {
  field: string;
  message: string;
}

/** Operational error carrying an HTTP status, so the error handler needn't guess. */
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
  static unauthorized(message = 'Authentication required'): ApiError {
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
  static unprocessable(message: string): ApiError {
    return new ApiError(422, message);
  }
}

export default ApiError;
