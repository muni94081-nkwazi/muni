/**
 * Shared shapes that mirror the response envelopes our backend services
 * actually return. Most list endpoints across user/product/order/cart
 * services wrap their payload as { data, meta? }; error responses share
 * a consistent { message, errors? } shape thanks to each service's
 * GlobalExceptionHandler / bootstrap exception rendering.
 */

export interface ApiEnvelope<T> {
  data: T;
}

export interface PaginatedMeta {
  current_page: number;
  last_page: number;
  per_page?: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface ApiErrorBody {
  message?: string;
  /**
   * Envelope used by checkout-service and order-service. Both shapes are live
   * across the backend, so consumers must read `error.message` as well as the
   * flat `message` above.
   */
  error?: {
    code?: string;
    message?: string;
  };
  errors?: Record<string, string[] | string>;
  /**
   * Per-rule detail from auth-service's 422s — validatePasswordPolicy returns
   * one string per rule the password missed, and the register / reset-password
   * / change-password controllers pass it through as `issues`.
   *
   * Read separately from `errors` because it is a flat array, not a field map.
   * It used to be dropped on the floor, which is how a shopper ended up being
   * told only "Password does not meet enterprise complexity policy" with no
   * indication of which part.
   */
  issues?: string[];
  timestamp?: string;
  status?: number;
  path?: string;
}

/** Normalized shape every api/* function throws on failure. */
export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[] | string>;
  /** True when the request never reached a server (backend down, DNS, offline) — status 0. */
  isNetworkError: boolean;

  constructor(
    message: string,
    status: number,
    errors?: Record<string, string[] | string>,
    isNetworkError = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.isNetworkError = isNetworkError;
  }
}
