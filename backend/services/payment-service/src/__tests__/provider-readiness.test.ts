import { jest, describe, it, expect } from '@jest/globals';

// ─── A provider with no credentials refuses, rather than trying anyway ────────
//
// `required()` in config/env.ts is fatal in production and a warning elsewhere,
// so outside production this service boots happily with empty provider
// credentials. What it then did was attempt the collection regardless:
//
//   • MTN and Airtel were called with an empty subscription key, which earns a
//     401 from the provider and reaches the customer as a broken checkout;
//   • the card gateway base URL defaulted to
//     'https://sandbox.cardgateway.muni.ug/v2', a host that does not exist, so
//     a deployment that set the three card credentials and forgot the URL sent
//     real authorisations at a domain that does not resolve.
//
// This file deliberately imports the module graph with NO provider credentials
// set, which is why it is a separate file from payment.test.ts — that one sets
// placeholders before import so it can reach the mocked drivers.

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('kafkajs', () => ({
  Kafka: class { producer() { return { connect: async () => undefined, send: async () => undefined }; } },
}));

// Every provider credential explicitly absent — the state a fresh clone is in.
for (const key of [
  'MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY', 'MTN_MOMO_COLLECTION_API_USER', 'MTN_MOMO_COLLECTION_API_KEY',
  'AIRTEL_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_SECRET',
  'VISA_CARD_GATEWAY_BASE_URL', 'VISA_CARD_MERCHANT_ID', 'VISA_CARD_API_KEY', 'VISA_CARD_API_SECRET',
]) {
  delete process.env[key];
}

const { paymentGatewayService } = await import('../services/gateway.service.js');
const { isMtnConfigured, isAirtelConfigured, isCardConfigured, providerReadiness } =
  await import('../config/env.js');

const order = (method: string, extra: Record<string, unknown> = {}) => ({
  orderId: `ord-${method}`,
  amount: 50000,
  currency: 'UGX',
  method,
  ...extra,
});

describe('readiness reflects what is actually configured', () => {
  it('reports every provider as unconfigured when nothing is set', () => {
    expect(isMtnConfigured()).toBe(false);
    expect(isAirtelConfigured()).toBe(false);
    expect(isCardConfigured()).toBe(false);
  });

  it('distinguishes "no driver" from "no credentials"', () => {
    const readiness = providerReadiness();

    // A real driver exists for these three; they only lack credentials.
    expect(readiness.mtn_momo).toEqual({ driver: true, configured: false });
    expect(readiness.airtel).toEqual({ driver: true, configured: false });
    expect(readiness.visa_card).toEqual({ driver: true, configured: false });

    // These two have no integration at all — a different problem entirely.
    expect(readiness.flutterwave.driver).toBe(false);
    expect(readiness.pesapal.driver).toBe(false);

    // And cash needs nothing.
    expect(readiness.cod).toEqual({ driver: true, configured: true });
  });

  it('no longer defaults the card gateway to a host that does not exist', async () => {
    const { env } = await import('../config/env.js');
    expect(env.visaCard.baseUrl).not.toContain('cardgateway.muni.ug');
    expect(env.visaCard.baseUrl).toBe('');
  });
});

describe('an unconfigured provider refuses the payment', () => {
  it('refuses MTN rather than calling it with an empty subscription key', async () => {
    await expect(paymentGatewayService.initiatePayment(
      order('mtn_momo', { phoneNumber: '+256771234567' }) as never,
    )).rejects.toMatchObject({ status: 503, name: 'PaymentMethodUnavailableError' });
  });

  it('refuses Airtel the same way', async () => {
    await expect(paymentGatewayService.initiatePayment(
      order('airtel', { phoneNumber: '+256751234567' }) as never,
    )).rejects.toMatchObject({ status: 503, name: 'PaymentMethodUnavailableError' });
  });

  it('refuses a card charge before building a 3DS return URL against nothing', async () => {
    await expect(paymentGatewayService.initiatePayment(
      order('visa_card', { cardToken: 'tok_test_not_real' }) as never,
    )).rejects.toMatchObject({ status: 503, name: 'PaymentMethodUnavailableError' });
  });

  it('says the deployment is missing configuration, not that the request was wrong', async () => {
    const err = await paymentGatewayService.initiatePayment(
      order('mtn_momo', { phoneNumber: '+256771234567' }) as never,
    ).catch((e) => e);

    expect(err.message).toMatch(/not configured/i);
    // A 400 would tell the customer to fix their request; nothing they can do
    // will conjure a credential.
    expect(err.status).not.toBe(400);
  });

  it('refuses before the phone number is even validated', async () => {
    // Order matters: a missing credential is the deployment's problem and
    // should not be reported as a malformed request.
    const err = await paymentGatewayService.initiatePayment(order('mtn_momo') as never).catch((e) => e);
    expect(err.name).toBe('PaymentMethodUnavailableError');
  });

  it('still takes cash on delivery, which needs no provider at all', async () => {
    const cod = await paymentGatewayService.initiatePayment(order('cod') as never);
    expect(cod.status).toBe('pending');
    expect(cod.checkoutUrl).toBeNull();
  });
});
