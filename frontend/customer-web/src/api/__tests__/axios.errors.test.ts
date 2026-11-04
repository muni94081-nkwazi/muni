import { describe, it, expect } from 'vitest';
import { ApiError, type ApiErrorBody } from '@/types/api.types';

// ─── Error message extraction ─────────────────────────────────────────────────
//
// Two envelope shapes are live across the backend:
//
//   flat    { message }                        — order-service, most services
//   nested  { success, error: { code, message } } — checkout-service, and
//                                                   order-service's own error
//                                                   handler
//
// The interceptor originally read only the flat one. Everything the checkout
// saga writes for the customer — "Only 2 of X left", "Payment could not be
// completed" — arrived nested, so it was dropped and replaced by axios's
// "Request failed with status code 409".
//
// This mirrors the interceptor's extraction so the precedence is pinned. The
// interceptor itself is wired into a module-level axios instance that also
// performs token refresh, which is why the rule is exercised here rather than
// by booting the whole client.

interface ErrorLike {
  response: { status: number; data: ApiErrorBody };
  message: string;
}

function extractMessage(error: ErrorLike): string {
  const body = error.response.data;
  const isServerError = error.response.status >= 500;

  return (
    body?.error?.message ??
    body?.message ??
    (isServerError
      ? 'Something went wrong on our end. Please try again in a moment.'
      : (error.message ?? 'That request could not be completed.'))
  );
}

const respond = (status: number, data: ApiErrorBody): ErrorLike =>
  ({ response: { status, data }, message: `Request failed with status code ${status}` });

describe('API error message extraction', () => {
  it('reads a nested error.message (checkout-service envelope)', () => {
    const message = extractMessage(
      respond(409, {
        success: false,
        error: { code: 'OutOfStockError', message: 'Only 2 of "Coffee" left — please reduce the quantity.' },
      } as ApiErrorBody),
    );

    expect(message).toBe('Only 2 of "Coffee" left — please reduce the quantity.');
    expect(message).not.toContain('status code');
  });

  it('reads a flat message when there is no nested error', () => {
    expect(extractMessage(respond(400, { message: 'Cart items are required' })))
      .toBe('Cart items are required');
  });

  it('prefers the nested message when both are present', () => {
    // The nested envelope is the newer, more specific one.
    const message = extractMessage(
      respond(402, {
        message: 'Payment Required',
        error: { code: 'PaymentFailedError', message: 'Payment could not be completed: insufficient funds' },
      } as ApiErrorBody),
    );

    expect(message).toBe('Payment could not be completed: insufficient funds');
  });

  it('falls back to a friendly line for a 5xx with no body message', () => {
    expect(extractMessage(respond(500, {} as ApiErrorBody)))
      .toBe('Something went wrong on our end. Please try again in a moment.');
  });

  it('falls back to axios’s own message for a 4xx with no body message', () => {
    expect(extractMessage(respond(404, {} as ApiErrorBody)))
      .toBe('Request failed with status code 404');
  });
});

describe('ApiError', () => {
  it('carries the status and is an Error, so errorMessage() surfaces it', () => {
    const err = new ApiError('Only 2 left', 409);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.isNetworkError).toBe(false);
  });
});
