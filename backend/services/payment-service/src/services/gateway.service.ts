import crypto from 'node:crypto';
import { env, isMtnConfigured, isAirtelConfigured, isCardConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { mtnMomoDriver } from '../drivers/mtn-momo.driver.js';
import { airtelMoneyDriver } from '../drivers/airtel-money.driver.js';
import type { MobileMoneyDriver } from '../drivers/types.js';
import { ProviderApiError } from '../drivers/types.js';
import { visaCardPaymentDriver, CardGatewayApiError, isSupportedCardCurrency, SUPPORTED_CARD_CURRENCIES } from '../drivers/visa-card.driver.js';
import { normalizeUgandaMsisdn, InvalidPhoneNumberError } from '../utils/phone.js';
import { convertToSettlementCurrency, CurrencyConversionError } from './currency.client.js';
import type { PaymentMethod, PaymentTransaction, MobileMoneyProviderName } from '../models/payment.model.js';

export interface InitiatePaymentParams {
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  email?: string;
  phoneNumber?: string;
  customerName?: string;
  idempotencyKey?: string;
  /** Client-side-tokenized card — required when method is 'visa_card'. Never a raw PAN. */
  cardToken?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * A payment method this deployment cannot actually take money with.
 *
 * Distinct from PaymentValidationError because there is nothing the caller can
 * fix: the integration is absent, not the input. 503 rather than 400 for the
 * same reason.
 */
export class PaymentMethodUnavailableError extends Error {
  readonly status = 503;
  constructor(method: string, detail: string) {
    super(`${method} is not available for payments right now. ${detail}`);
    this.name = 'PaymentMethodUnavailableError';
  }
}

/** Thrown for caller-fixable input problems (bad phone number, unsupported currency, etc). */
export class PaymentValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'PaymentValidationError';
  }
}

const MOBILE_MONEY_METHODS = new Set<PaymentMethod>(['mtn_momo', 'airtel']);

function driverFor(method: 'mtn_momo' | 'airtel'): { driver: MobileMoneyDriver; provider: MobileMoneyProviderName } {
  return method === 'mtn_momo'
    ? { driver: mtnMomoDriver, provider: 'mtn_momo' }
    : { driver: airtelMoneyDriver, provider: 'airtel_money' };
}

export class PaymentGatewayService {
  private flutterwaveSecretHash = env.legacy.flutterwaveSecretHash;
  private pesapalConsumerSecret = env.legacy.pesapalConsumerSecret;

  /**
   * Initiate a collection request. `amount`/`currency` are automatically
   * converted to the platform settlement currency (UGX) via currency-service
   * when they differ — mandatory for MTN MoMo / Airtel Money (their Uganda
   * APIs only accept UGX), best-effort/non-fatal for other gateways that
   * natively support multi-currency checkout.
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentTransaction> {
    const reference = `PAY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const paymentId = `pmt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const currency = params.currency || 'UGX';
    const isMobileMoney = MOBILE_MONEY_METHODS.has(params.method);

    let amountUGX = params.amount;
    let exchangeRate = 1;

    if (currency.toUpperCase() !== env.currency.settlementCurrency.toUpperCase()) {
      try {
        const converted = await convertToSettlementCurrency(params.amount, currency);
        amountUGX = converted.amount;
        exchangeRate = converted.rate;
      } catch (err) {
        if (isMobileMoney) throw err; // MTN/Airtel Uganda settle in UGX only — cannot proceed without a rate
        logger.warn('[gateway] Currency conversion unavailable — proceeding without a converted UGX ledger amount', {
          method: params.method,
          currency,
          error: (err as Error).message,
        });
      }
    }

    const base: PaymentTransaction = {
      paymentId,
      reference,
      orderId: params.orderId,
      amount: params.amount,
      currency,
      method: params.method,
      status: 'pending',
      phoneNumber: params.phoneNumber ?? null,
      checkoutUrl: null,
      idempotencyKey: params.idempotencyKey ?? null,
      rawPayload: null,
      paidAt: null,
      amountUGX,
      exchangeRate,
      createdAt: now,
      updatedAt: now,
    };

    if (params.method === 'cod') {
      return base; // Cash on Delivery remains pending until the courier collects payment
    }

    // Flutterwave and Pesapal used to return a checkoutUrl built by
    // interpolating MUNI's OWN reference into the provider's domain. No API
    // call was made. The real hosted-payment flows return a link the provider
    // mints against a transaction it has recorded; these URLs were issued by
    // nobody and resolve to no payment. A customer redirected to one would land
    // on an error page having been told their checkout was ready.
    //
    // Refusing is the honest behaviour until a real integration exists. There
    // is no driver for either provider in this repository — unlike MTN, Airtel
    // and the card path, which have genuine drivers and are merely missing
    // credentials.
    if (params.method === 'flutterwave' || params.method === 'card') {
      throw new PaymentMethodUnavailableError(
        'Flutterwave',
        'No Flutterwave integration is configured on this deployment.',
      );
    }

    if (params.method === 'visa_card') {
      return this.initiateCardPayment(base, params);
    }

    if (params.method === 'pesapal') {
      throw new PaymentMethodUnavailableError(
        'Pesapal',
        'No Pesapal integration is configured on this deployment.',
      );
    }

    if (params.method === 'mtn_momo' || params.method === 'airtel') {
      return this.initiateMobileMoneyCollection(base, params, amountUGX);
    }

    return base;
  }

  private async initiateMobileMoneyCollection(
    base: PaymentTransaction,
    params: InitiatePaymentParams,
    amountUGX: number,
  ): Promise<PaymentTransaction> {
    // An empty subscription key earns a 401 from MTN and an opaque failure for
    // the customer. Saying the method is unavailable is both truthful and
    // actionable — the deployment is missing a credential, not the request.
    const configured = params.method === 'mtn_momo' ? isMtnConfigured() : isAirtelConfigured();
    if (!configured) {
      throw new PaymentMethodUnavailableError(
        params.method === 'mtn_momo' ? 'MTN Mobile Money' : 'Airtel Money',
        'Provider credentials are not configured on this deployment.',
      );
    }

    if (!params.phoneNumber) {
      throw new PaymentValidationError(`phoneNumber is required for ${params.method} payments`);
    }

    let phoneNumber: string;
    try {
      phoneNumber = normalizeUgandaMsisdn(params.phoneNumber);
    } catch (err) {
      if (err instanceof InvalidPhoneNumberError) throw new PaymentValidationError(err.message);
      throw err;
    }

    const { driver, provider } = driverFor(params.method as 'mtn_momo' | 'airtel');

    try {
      const result = await driver.initiateCollection({
        amount: amountUGX,
        phoneNumber,
        externalId: base.reference,
        payerMessage: `Order ${base.orderId}`,
        payeeNote: base.orderId,
      });

      logger.info('[gateway] Mobile money collection initiated', {
        provider,
        reference: base.reference,
        providerReferenceId: result.providerReferenceId,
      });

      return {
        ...base,
        phoneNumber,
        provider,
        providerReferenceId: result.providerReferenceId,
        providerStatus: 'PENDING_USER_PIN_PROMPT',
        pollAttempts: 0,
      };
    } catch (err) {
      if (err instanceof ProviderApiError) {
        logger.error('[gateway] Provider rejected collection request', {
          provider,
          reference: base.reference,
          status: err.status,
          raw: err.raw,
        });
      }
      throw err;
    }
  }

  /**
   * Authorize a direct Visa/Mastercard charge via `VisaCardPaymentDriver`.
   * Returns immediately with either a settled AUTHENTICATED outcome or a
   * CHALLENGE_REQUIRED outcome carrying `threeDSecureRedirectUrl` — the
   * caller (payment.controller.ts) hands that URL to the frontend, which
   * opens it in an iframe/webview until the ACS redirects back to
   * `/payments/callbacks/visa/3ds-return`.
   */
  private async initiateCardPayment(base: PaymentTransaction, params: InitiatePaymentParams): Promise<PaymentTransaction> {
    // Before anything else: outside production this service boots with empty
    // card credentials, and the old base URL defaulted to a host that does not
    // exist. Attempting the charge produced a DNS failure the customer saw as a
    // broken checkout.
    if (!isCardConfigured()) {
      throw new PaymentMethodUnavailableError(
        'Card payment',
        'Card gateway credentials are not configured on this deployment.',
      );
    }

    if (!params.cardToken) {
      throw new PaymentValidationError('cardToken is required for visa_card payments');
    }
    if (!isSupportedCardCurrency(base.currency)) {
      throw new PaymentValidationError(
        `Currency ${base.currency} is not supported for card settlement (supported: ${SUPPORTED_CARD_CURRENCIES.join(', ')})`,
      );
    }

    const returnUrl = `${env.visaCard.threeDsReturnBaseUrl}/api/v1/payments/callbacks/visa/3ds-return?reference=${encodeURIComponent(base.reference)}`;

    try {
      const auth = await visaCardPaymentDriver.authorize({
        cardToken: params.cardToken,
        amount: params.amount,
        currency: base.currency,
        reference: base.reference,
        orderId: base.orderId,
        customerEmail: params.email,
        customerName: params.customerName,
        returnUrl,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      logger.info('[gateway] Visa/Mastercard authorization requested', {
        reference: base.reference,
        providerTransactionId: auth.providerTransactionId,
        threeDSecureStatus: auth.threeDSecureStatus,
      });

      const settled = auth.status === 'AUTHORIZED' && auth.threeDSecureStatus === 'AUTHENTICATED';
      const declined = auth.status === 'DECLINED' || auth.threeDSecureStatus === 'REJECTED';

      return {
        ...base,
        status: declined ? 'failed' : settled ? 'processing' : 'pending',
        failureReason: declined ? (auth.declineReason ?? 'Card gateway declined the authorization') : undefined,
        threeDSecureRedirectUrl: auth.threeDSecureRedirectUrl ?? null,
        card: {
          cardToken: params.cardToken,
          last4: auth.last4,
          brand: auth.brand,
          expiryMonth: auth.expiryMonth,
          expiryYear: auth.expiryYear,
          threeDSecureStatus: auth.threeDSecureStatus,
          authorizationId: auth.providerTransactionId,
        },
      };
    } catch (err) {
      if (err instanceof CardGatewayApiError) {
        logger.error('[gateway] Card gateway rejected authorization request', {
          reference: base.reference,
          status: err.status,
          raw: err.raw,
        });
      }
      throw err;
    }
  }

  /** Capture a previously authorized card transaction (e.g. on order fulfilment for auth-only flows). */
  async captureCardPayment(payment: PaymentTransaction, amount?: number): Promise<void> {
    if (!payment.card?.authorizationId) {
      throw new PaymentValidationError('Payment has no card authorization to capture');
    }

    const result = await visaCardPaymentDriver.capture({
      providerTransactionId: payment.card.authorizationId,
      amount: amount ?? payment.amount,
      currency: payment.currency,
    });

    payment.card.captureId = result.captureId;
  }

  /** Refund a captured Visa/Mastercard transaction, full or partial. */
  async refundCardPayment(payment: PaymentTransaction, amount?: number, reason?: string) {
    if (!payment.card?.authorizationId) {
      throw new PaymentValidationError('Payment has no card authorization to refund');
    }

    return visaCardPaymentDriver.refund({
      providerTransactionId: payment.card.authorizationId,
      amount: amount ?? payment.amount,
      currency: payment.currency,
      reason,
    });
  }

  /**
   * Constant-time string comparison that fails closed on an absent secret.
   *
   * Both checks below previously used `===`, which leaks a prefix-length
   * timing oracle on a value an attacker supplies and can iterate on. It also
   * matters that this returns false when either side is empty: with the
   * committed default secrets removed, an unconfigured integration must
   * reject every webhook rather than accept one.
   */
  private secretsMatch(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    // timingSafeEqual throws on length mismatch — a differing length is
    // already public information (it is the response time either way).
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /** Verify Flutterwave Webhook Signature (static secret header verification) */
  verifyFlutterwaveSignature(signature: string | undefined): boolean {
    if (!this.flutterwaveSecretHash) {
      logger.warn('[gateway] FLUTTERWAVE_SECRET_HASH is not set — rejecting Flutterwave webhook');
      return false;
    }
    return this.secretsMatch(signature, this.flutterwaveSecretHash);
  }

  /** Verify Pesapal Signature */
  verifyPesapalSignature(payload: string, signature: string | undefined): boolean {
    // Without this guard an empty consumer secret still produces a perfectly
    // valid HMAC — anyone who knows the payload could compute the same digest
    // with an empty key and have it accepted.
    if (!this.pesapalConsumerSecret) {
      logger.warn('[gateway] PESAPAL_CONSUMER_SECRET is not set — rejecting Pesapal webhook');
      return false;
    }
    if (!signature) return false;
    const computedHmac = crypto.createHmac('sha256', this.pesapalConsumerSecret).update(payload).digest('hex');
    return this.secretsMatch(computedHmac, signature);
  }
}

export { CurrencyConversionError };
export const paymentGatewayService = new PaymentGatewayService();
