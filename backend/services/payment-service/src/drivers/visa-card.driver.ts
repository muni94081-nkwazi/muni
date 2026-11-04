import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { CardBrand, ThreeDSecureStatus } from '../models/payment.model.js';

// ─── Visa/Mastercard Card Driver — Tokenized Charges + 3DS2 ────────────────────
//
// Talks to a PCI-DSS Level 1 card acquirer/gateway (hosted tokenization +
// EMV 3-D Secure 2.x) fronting Visa and Mastercard. This service never
// receives a raw PAN, CVC, or full expiry — only the `cardToken` the
// gateway's client-side SDK produced in the browser/app, which is the
// boundary that keeps this backend at SAQ A-EP rather than full PCI scope.
//
// Flow:
//   1. authorize()  — submit the token + amount; gateway either authorizes
//      outright (low-risk, frictionless 3DS) or returns a 3DS2 challenge
//      redirect URL the customer must complete in an iframe/webview.
//   2. (if challenged) the ACS redirects the customer back to our
//      `/payments/callbacks/visa/3ds-return` endpoint, which calls
//      getAuthorizationStatus() to learn the final outcome.
//   3. capture()   — settle a previously authorized (but not auto-captured)
//      transaction.
//   4. refund()    — full or partial refund of a captured transaction.

export const SUPPORTED_CARD_CURRENCIES = ['UGX', 'USD', 'EUR', 'KES', 'RWF', 'TZS'] as const;
export type SupportedCardCurrency = (typeof SUPPORTED_CARD_CURRENCIES)[number];

export function isSupportedCardCurrency(currency: string): currency is SupportedCardCurrency {
  return (SUPPORTED_CARD_CURRENCIES as readonly string[]).includes(currency.toUpperCase());
}

export class UnsupportedCardCurrencyError extends Error {
  constructor(currency: string) {
    super(`Currency ${currency} is not supported for card settlement (supported: ${SUPPORTED_CARD_CURRENCIES.join(', ')})`);
    this.name = 'UnsupportedCardCurrencyError';
  }
}

/** Thrown for any non-2xx response from the card gateway, or a malformed gateway response. */
export class CardGatewayApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'CardGatewayApiError';
  }
}

export interface ChargeCardParams {
  /** Client-side-generated token — never a raw PAN. */
  cardToken: string;
  amount: number;
  currency: string;
  /** Our internal payment reference, sent to the gateway as the merchant order id. */
  reference: string;
  orderId: string;
  customerEmail?: string;
  customerName?: string;
  /** Where the issuer's ACS should redirect the browser once the 3DS2 challenge resolves. */
  returnUrl: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CardAuthorizationResult {
  providerTransactionId: string;
  status: 'AUTHORIZED' | 'DECLINED' | 'PENDING_3DS';
  threeDSecureStatus: ThreeDSecureStatus;
  threeDSecureRedirectUrl?: string;
  last4: string;
  brand: CardBrand;
  expiryMonth: string;
  expiryYear: string;
  declineReason?: string;
  raw?: unknown;
}

export interface CaptureParams {
  providerTransactionId: string;
  amount: number;
  currency: string;
}

export interface CaptureResult {
  captureId: string;
  status: 'CAPTURED';
  raw?: unknown;
}

export interface RefundParams {
  providerTransactionId: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  status: 'REFUNDED';
  raw?: unknown;
}

export interface AuthorizationStatusResult {
  status: 'AUTHORIZED' | 'DECLINED' | 'PENDING_3DS';
  threeDSecureStatus: ThreeDSecureStatus;
  providerTransactionId: string;
  declineReason?: string;
  raw?: unknown;
}

const FETCH_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class VisaCardPaymentDriver {
  private readonly baseUrl = env.visaCard.baseUrl;

  private async request<T>(path: string, init: RequestInit & { expectStatus?: number[] } = {}): Promise<T> {
    const res = await fetchWithTimeout(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Id': env.visaCard.merchantId,
        'X-Api-Key': env.visaCard.apiKey,
        // HMAC-SHA256 request signing over the body would be layered in here
        // for a real acquirer integration; omitted since the exact canonical
        // string format is gateway-specific and out of scope for this driver.
        Authorization: `Bearer ${env.visaCard.apiSecret}`,
        ...init.headers,
      },
    });

    const expected = init.expectStatus ?? [200, 201];
    if (!expected.includes(res.status)) {
      const body = await res.text().catch(() => '');
      throw new CardGatewayApiError(`Card gateway request to ${path} failed: ${res.status} ${res.statusText}`, res.status, body);
    }

    return (await res.json()) as T;
  }

  /**
   * Tokenized charge + 3DS2 authorization. Returns either a straight
   * AUTHORIZED/DECLINED outcome (frictionless flow) or a CHALLENGE_REQUIRED
   * outcome carrying the iframe/webview URL the customer must complete.
   */
  async authorize(params: ChargeCardParams): Promise<CardAuthorizationResult> {
    if (!params.cardToken) {
      throw new CardGatewayApiError('cardToken is required — raw card numbers are never accepted by this driver', 400);
    }
    if (!isSupportedCardCurrency(params.currency)) {
      throw new UnsupportedCardCurrencyError(params.currency);
    }

    const data = await this.request<{
      id: string;
      status: 'authorized' | 'declined' | 'pending_3ds_challenge';
      three_d_secure: { status: 'challenge_required' | 'authenticated' | 'rejected'; challenge_url?: string };
      card: { last4: string; brand: 'visa' | 'mastercard'; exp_month: string; exp_year: string };
      decline_reason?: string;
    }>('/payments/authorize', {
      method: 'POST',
      expectStatus: [200, 201, 202],
      body: JSON.stringify({
        card_token: params.cardToken,
        amount: params.amount,
        currency: params.currency.toUpperCase(),
        merchant_reference: params.reference,
        order_id: params.orderId,
        customer: { email: params.customerEmail, name: params.customerName },
        three_d_secure: { return_url: params.returnUrl },
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
      }),
    });

    logger.info('[visa-card] Authorization requested', {
      reference: params.reference,
      providerTransactionId: data.id,
      status: data.status,
      threeDSecureStatus: data.three_d_secure.status,
    });

    return {
      providerTransactionId: data.id,
      status: mapAuthStatus(data.status),
      threeDSecureStatus: mapThreeDsStatus(data.three_d_secure.status),
      threeDSecureRedirectUrl: data.three_d_secure.challenge_url,
      last4: data.card.last4,
      brand: mapBrand(data.card.brand),
      expiryMonth: data.card.exp_month,
      expiryYear: data.card.exp_year,
      declineReason: data.decline_reason,
      raw: data,
    };
  }

  /** Re-queries the gateway for the outcome of a 3DS2 challenge after the ACS redirects the browser back to us. */
  async getAuthorizationStatus(providerTransactionId: string): Promise<AuthorizationStatusResult> {
    const data = await this.request<{
      id: string;
      status: 'authorized' | 'declined' | 'pending_3ds_challenge';
      three_d_secure: { status: 'challenge_required' | 'authenticated' | 'rejected' };
      decline_reason?: string;
    }>(`/payments/${encodeURIComponent(providerTransactionId)}`, { method: 'GET' });

    return {
      providerTransactionId: data.id,
      status: mapAuthStatus(data.status),
      threeDSecureStatus: mapThreeDsStatus(data.three_d_secure.status),
      declineReason: data.decline_reason,
      raw: data,
    };
  }

  /** Captures a previously authorized transaction (no-op if the gateway auto-captures on authorize). */
  async capture(params: CaptureParams): Promise<CaptureResult> {
    if (!isSupportedCardCurrency(params.currency)) {
      throw new UnsupportedCardCurrencyError(params.currency);
    }

    const data = await this.request<{ id: string; status: string }>(
      `/payments/${encodeURIComponent(params.providerTransactionId)}/capture`,
      {
        method: 'POST',
        expectStatus: [200, 201],
        body: JSON.stringify({ amount: params.amount, currency: params.currency.toUpperCase() }),
      },
    );

    logger.info('[visa-card] Capture settled', { providerTransactionId: params.providerTransactionId, captureId: data.id });
    return { captureId: data.id, status: 'CAPTURED', raw: data };
  }

  /** Full or partial refund of a captured card transaction. */
  async refund(params: RefundParams): Promise<RefundResult> {
    if (!isSupportedCardCurrency(params.currency)) {
      throw new UnsupportedCardCurrencyError(params.currency);
    }

    const data = await this.request<{ id: string; status: string }>(
      `/payments/${encodeURIComponent(params.providerTransactionId)}/refund`,
      {
        method: 'POST',
        expectStatus: [200, 201],
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency.toUpperCase(),
          reason: params.reason ?? 'Customer request',
        }),
      },
    );

    logger.info('[visa-card] Refund issued', { providerTransactionId: params.providerTransactionId, refundId: data.id });
    return { refundId: data.id, status: 'REFUNDED', raw: data };
  }
}

function mapAuthStatus(status: 'authorized' | 'declined' | 'pending_3ds_challenge'): CardAuthorizationResult['status'] {
  switch (status) {
    case 'authorized':
      return 'AUTHORIZED';
    case 'declined':
      return 'DECLINED';
    default:
      return 'PENDING_3DS';
  }
}

function mapThreeDsStatus(status: 'challenge_required' | 'authenticated' | 'rejected'): ThreeDSecureStatus {
  switch (status) {
    case 'authenticated':
      return 'AUTHENTICATED';
    case 'rejected':
      return 'REJECTED';
    default:
      return 'CHALLENGE_REQUIRED';
  }
}

function mapBrand(brand: 'visa' | 'mastercard'): CardBrand {
  return brand === 'mastercard' ? 'MASTERCARD' : 'VISA';
}

export const visaCardPaymentDriver = new VisaCardPaymentDriver();
