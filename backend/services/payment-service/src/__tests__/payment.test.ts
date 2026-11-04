import crypto from 'node:crypto';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

// Mobile money drivers make real HTTP calls to MTN/Airtel — mocked here so
// the unit test suite stays fast, deterministic, and runnable without live
// sandbox credentials. Driver-specific request/response shaping is covered
// by the driver unit tests below instead.
const mockMtnInitiateCollection = jest.fn<() => Promise<{ providerReferenceId: string; status: 'PENDING' }>>();
const mockMtnInitiateDisbursement = jest.fn<() => Promise<{ providerReferenceId: string; status: 'PENDING' }>>();
const mockMtnGetDisbursementStatus = jest.fn<() => Promise<{ status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' }>>();

jest.unstable_mockModule('../drivers/mtn-momo.driver.js', () => ({
  mtnMomoDriver: {
    provider: 'mtn_momo',
    initiateCollection: mockMtnInitiateCollection,
    getCollectionStatus: jest.fn(),
    initiateDisbursement: mockMtnInitiateDisbursement,
    getDisbursementStatus: mockMtnGetDisbursementStatus,
  },
}));

jest.unstable_mockModule('../drivers/airtel-money.driver.js', () => ({
  airtelMoneyDriver: {
    provider: 'airtel_money',
    initiateCollection: jest.fn(),
    getCollectionStatus: jest.fn(),
    initiateDisbursement: jest.fn(),
    getDisbursementStatus: jest.fn(),
  },
}));

// Vendor balances, the ledger and payouts live in Postgres now. The double
// implements the slice of the Prisma API those services use, so the money paths
// below are exercised for real without a live database. See helpers/prisma-double.ts.
const prismaDouble = await import('./helpers/prisma-double.js');

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: prismaDouble.prisma,
  connectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));

// Both legacy aggregator secrets are configured before gateway.service.js is
// imported: config/env.ts reads process.env once at module load, and
// PaymentGatewayService captures the values in field initialisers. There are
// deliberately no committed defaults any more, so without this the service
// would (correctly) reject every webhook below.
process.env.FLUTTERWAVE_SECRET_HASH = 'test-flw-secret-hash-not-a-real-credential';
process.env.PESAPAL_CONSUMER_SECRET = 'test-pesapal-consumer-secret-not-real';

// gateway.service now refuses a method whose credentials are absent, rather
// than calling MTN with an empty subscription key and handing the customer the
// provider's 401. These placeholders make the config LOOK present so the tests
// below still reach the mocked drivers — they are not credentials and no real
// request is ever made with them.
process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY = 'test-not-a-real-subscription-key';
process.env.MTN_MOMO_COLLECTION_API_USER = 'test-not-a-real-api-user';
process.env.MTN_MOMO_COLLECTION_API_KEY = 'test-not-a-real-api-key';
process.env.AIRTEL_MONEY_CLIENT_ID = 'test-not-a-real-client-id';
process.env.AIRTEL_MONEY_CLIENT_SECRET = 'test-not-a-real-client-secret';

const { paymentGatewayService, PaymentGatewayService } = await import('../services/gateway.service.js');
const { env: paymentEnv } = await import('../config/env.js');
const { paymentSplitService } = await import('../services/split.service.js');
// kafkajs is stubbed only so importing the consumer module does not build a
// real client — the handler under test never touches it.
jest.unstable_mockModule('kafkajs', () => ({
  Kafka: class { consumer() { return { connect: jest.fn(), subscribe: jest.fn(), run: jest.fn(), disconnect: jest.fn() }; } producer() { return { connect: jest.fn(), disconnect: jest.fn() }; } },
}));
const { handleOrderMessage } = await import('../consumers/order.consumer.js');
const { vendorPayoutService } = await import('../services/payout.service.js');
const { verifyHmacSignature } = await import('../security/webhook-signature.js');
const { paymentRepository } = await import('../repositories/payment.repository.js');
const { markPaymentSuccessful, markPaymentFailed } = await import('../services/payment-resolution.service.js');
const { normalizeUgandaMsisdn, InvalidPhoneNumberError } = await import('../utils/phone.js');

describe('Payment Gateway & Payment Splitting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaDouble.resetDatabase();
    mockMtnInitiateCollection.mockResolvedValue({ providerReferenceId: 'mtn-ref-123', status: 'PENDING' });
    mockMtnInitiateDisbursement.mockResolvedValue({ providerReferenceId: 'mtn-disb-456', status: 'PENDING' });
    mockMtnGetDisbursementStatus.mockResolvedValue({ status: 'SUCCESSFUL' });
  });

  describe('paymentGatewayService', () => {
    it('initiates a real MTN MoMo collection and sets PENDING_USER_PIN_PROMPT', async () => {
      const transaction = await paymentGatewayService.initiatePayment({
        orderId: 'ord-1001',
        amount: 50000,
        currency: 'UGX',
        method: 'mtn_momo',
        phoneNumber: '+256771234567',
      });

      expect(transaction.paymentId).toBeDefined();
      expect(transaction.reference).toMatch(/^PAY-/);
      expect(transaction.amount).toBe(50000);
      expect(transaction.status).toBe('pending');
      expect(transaction.provider).toBe('mtn_momo');
      expect(transaction.providerStatus).toBe('PENDING_USER_PIN_PROMPT');
      expect(transaction.providerReferenceId).toBe('mtn-ref-123');
      expect(mockMtnInitiateCollection).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 50000, phoneNumber: '256771234567', externalId: transaction.reference }),
      );
    });

    it('rejects a mobile money payment with no phone number', async () => {
      await expect(
        paymentGatewayService.initiatePayment({
          orderId: 'ord-1002',
          amount: 20000,
          currency: 'UGX',
          method: 'mtn_momo',
        }),
      ).rejects.toThrow(/phoneNumber is required/);
      expect(mockMtnInitiateCollection).not.toHaveBeenCalled();
    });

    it('verifies valid Flutterwave webhook signature', () => {
      const isValid = paymentGatewayService.verifyFlutterwaveSignature(
        'test-flw-secret-hash-not-a-real-credential',
      );
      expect(isValid).toBe(true);
    });

    it('rejects invalid Flutterwave webhook signature', () => {
      const isValid = paymentGatewayService.verifyFlutterwaveSignature('wrong_hash');
      expect(isValid).toBe(false);
    });

    it('rejects a Flutterwave webhook carrying no signature header', () => {
      expect(paymentGatewayService.verifyFlutterwaveSignature(undefined)).toBe(false);
      expect(paymentGatewayService.verifyFlutterwaveSignature('')).toBe(false);
    });

    // This previously passed for the wrong reason: the secret defaulted to the
    // literal 'muni_flw_secret_hash_uganda', committed to this repository, so
    // an unconfigured deployment accepted a webhook from anyone who had read
    // the source. With no default, an absent secret must reject everything.
    it('rejects every Flutterwave webhook when the secret is not configured', () => {
      const original = paymentEnv.legacy.flutterwaveSecretHash;
      (paymentEnv.legacy as { flutterwaveSecretHash: string }).flutterwaveSecretHash = '';
      try {
        const unconfigured = new PaymentGatewayService();
        expect(unconfigured.verifyFlutterwaveSignature('anything')).toBe(false);
        expect(unconfigured.verifyFlutterwaveSignature('')).toBe(false);
      } finally {
        (paymentEnv.legacy as { flutterwaveSecretHash: string }).flutterwaveSecretHash = original;
      }
    });

    it('verifies a correctly signed Pesapal webhook and rejects a tampered one', () => {
      const body = JSON.stringify({ OrderTrackingId: 'otid-1', OrderNotificationType: 'IPN' });
      const good = crypto
        .createHmac('sha256', 'test-pesapal-consumer-secret-not-real')
        .update(body)
        .digest('hex');

      expect(paymentGatewayService.verifyPesapalSignature(body, good)).toBe(true);
      expect(paymentGatewayService.verifyPesapalSignature(body, 'deadbeef')).toBe(false);
      expect(paymentGatewayService.verifyPesapalSignature(body, undefined)).toBe(false);
    });

    // An empty HMAC key still produces a perfectly valid digest, so without an
    // explicit guard anyone who knows the payload could sign it themselves
    // with the empty key and be accepted. Fail closed instead.
    it('rejects a Pesapal webhook signed with an empty key when the secret is unset', () => {
      const original = paymentEnv.legacy.pesapalConsumerSecret;
      (paymentEnv.legacy as { pesapalConsumerSecret: string }).pesapalConsumerSecret = '';
      try {
        const unconfigured = new PaymentGatewayService();
        const body = JSON.stringify({ OrderTrackingId: 'otid-2' });
        const forged = crypto.createHmac('sha256', '').update(body).digest('hex');

        expect(unconfigured.verifyPesapalSignature(body, forged)).toBe(false);
      } finally {
        (paymentEnv.legacy as { pesapalConsumerSecret: string }).pesapalConsumerSecret = original;
      }
    });
  });

  describe('paymentSplitService', () => {
    it('splits payment into 87.5% vendor share and 12.5% platform commission', async () => {
      const result = await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-001',
        orderId: 'ord-1001',
        subOrders: [
          { subOrderId: 'sub-1', sellerId: 'seller-A', subtotal: 100000 },
        ],
      });

      expect(result.ledgerEntries).toHaveLength(1);
      expect(result.commissions).toHaveLength(1);

      const ledger = result.ledgerEntries[0];
      expect(ledger.grossAmount).toBe(100000);
      expect(ledger.platformFee).toBe(12500); // 12.5%
      expect(ledger.netVendorAmount).toBe(87500); // 87.5%
      expect(ledger.status).toBe('pending');

      // Credited to pending, not available: the buyer has paid but the goods
      // have not been delivered, so it is not the seller's to withdraw yet.
      const balance = await paymentSplitService.getVendorBalance('seller-A');
      expect(balance.pendingBalance).toBe(87500);
      expect(balance.availableBalance).toBe(0);
    });

    it('credits a sub-order only once when the same payment is split twice', async () => {
      const split = {
        transactionId: 'pmt-dupe',
        orderId: 'ord-dupe',
        subOrders: [{ subOrderId: 'sub-dupe-1', sellerId: 'seller-F', subtotal: 80000 }],
      };

      await paymentSplitService.processPaymentSplit(split);
      await paymentSplitService.processPaymentSplit(split);

      const balance = await paymentSplitService.getVendorBalance('seller-F');
      expect(balance.pendingBalance).toBe(70000); // 80000 * 0.875, credited once

      const ledger = await paymentSplitService.getVendorLedger('seller-F');
      expect(ledger.total).toBe(1);
    });

    it('releases pending vendor balance to available balance on sub-order delivery', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-002',
        orderId: 'ord-1002',
        subOrders: [
          { subOrderId: 'sub-deliv-1', sellerId: 'seller-B', subtotal: 40000 },
        ],
      });

      const updatedBalance = await paymentSplitService.releaseSubOrderVendorFunds('sub-deliv-1', 'seller-B');
      expect(updatedBalance).not.toBeNull();
      expect(updatedBalance?.availableBalance).toBe(35000); // 40000 * 0.875
      expect(updatedBalance?.pendingBalance).toBe(0);
    });

    it('ignores a repeated delivery event instead of releasing the funds twice', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-003',
        orderId: 'ord-1003',
        subOrders: [{ subOrderId: 'sub-deliv-2', sellerId: 'seller-G', subtotal: 40000 }],
      });

      await paymentSplitService.releaseSubOrderVendorFunds('sub-deliv-2', 'seller-G');
      // At-least-once delivery from Kafka means this genuinely happens.
      const second = await paymentSplitService.releaseSubOrderVendorFunds('sub-deliv-2', 'seller-G');

      expect(second).toBeNull();
      const balance = await paymentSplitService.getVendorBalance('seller-G');
      expect(balance.availableBalance).toBe(35000);
    });

    it('credits once when two delivery events for the same sub-order race', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-004',
        orderId: 'ord-1004',
        subOrders: [{ subOrderId: 'sub-race', sellerId: 'seller-R', subtotal: 40000 }],
      });

      // Both calls read the pending entry before either has flipped it, which
      // is what a redelivered Kafka message looks like under concurrency.
      const [first, second] = await Promise.all([
        paymentSplitService.releaseSubOrderVendorFunds('sub-race', 'seller-R'),
        paymentSplitService.releaseSubOrderVendorFunds('sub-race', 'seller-R'),
      ]);

      expect([first, second].filter(Boolean)).toHaveLength(1);
      const balance = await paymentSplitService.getVendorBalance('seller-R');
      expect(balance.availableBalance).toBe(35000);
      expect(balance.pendingBalance).toBe(0);
    });
  });

  // ─── Settlement linkage ───────────────────────────────────────────────────
  //
  // Escrow and the ledger are written when the payment clears, which on the
  // checkout path is BEFORE order-service has created anything. The ledger row
  // was therefore keyed on `sub_<checkoutSessionId>_<vendorId>`, while delivery
  // later arrived carrying order-service's real sub-order id. Nothing matched,
  // `releaseSubOrderVendorFunds` returned null, and every seller's money stayed
  // in pendingBalance for good.

  describe('linking settlement to the real sub-orders', () => {
    /** What the saga produces: a split keyed on the checkout session id. */
    async function splitUnderSessionId(sessionId: string, sellerId: string, subtotal: number) {
      await paymentSplitService.processPaymentSplit({
        transactionId: `pmt-${sessionId}`,
        orderId: sessionId,
        subOrders: [{ subOrderId: `sub_${sessionId}_${sellerId}`, sellerId, subtotal }],
      });
    }

    it('re-keys the ledger onto the id delivery will actually quote', async () => {
      await splitUnderSessionId('sess-link-1', 'seller-L1', 40000);

      const { linked } = await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-1',
        orderId: 'ord-real-1',
        subOrders: [{ sellerId: 'seller-L1', subOrderId: 'suborder-real-1' }],
      });

      expect(linked).toBe(1);
      const released = await paymentSplitService.releaseSubOrderVendorFunds('suborder-real-1', 'seller-L1');
      expect(released).not.toBeNull();
    });

    it('is the difference between a seller being paid and not', async () => {
      // The regression in one assertion: without the link the delivery event
      // finds nothing and the money never becomes withdrawable.
      await splitUnderSessionId('sess-link-2', 'seller-L2', 40000);

      const beforeLink = await paymentSplitService.releaseSubOrderVendorFunds('suborder-real-2', 'seller-L2');
      expect(beforeLink).toBeNull();
      expect((await paymentSplitService.getVendorBalance('seller-L2')).availableBalance).toBe(0);

      await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-2',
        orderId: 'ord-real-2',
        subOrders: [{ sellerId: 'seller-L2', subOrderId: 'suborder-real-2' }],
      });

      const afterLink = await paymentSplitService.releaseSubOrderVendorFunds('suborder-real-2', 'seller-L2');
      expect(afterLink?.availableBalance).toBe(35000);
      expect(afterLink?.pendingBalance).toBe(0);
    });

    it('adopts order-service figures rather than its own commission maths', async () => {
      // payment-service derived 12.5% from its own constant; order-service
      // computed the real share against the basket it priced, including the
      // per-seller discount. Two services costing one payout is a divergence
      // waiting to happen, so the order's answer wins.
      await splitUnderSessionId('sess-link-3', 'seller-L3', 2000);

      await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-3',
        orderId: 'ord-real-3',
        subOrders: [{
          sellerId: 'seller-L3',
          subOrderId: 'suborder-real-3',
          vendorShare: 1575,          // order-service, net of a 200 discount
          platformCommission: 225,
        }],
      });

      const [entry] = (await paymentSplitService.getVendorLedger('seller-L3')).data;
      expect(entry.netVendorAmount).toBe(1575);
      expect(entry.platformFee).toBe(225);
    });

    it('moves the pending balance by the difference, not by the whole figure', async () => {
      // 2000 goods credited 1750 at payment time; the order says 1575.
      await splitUnderSessionId('sess-link-4', 'seller-L4', 2000);
      expect((await paymentSplitService.getVendorBalance('seller-L4')).pendingBalance).toBe(1750);

      await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-4',
        orderId: 'ord-real-4',
        subOrders: [{ sellerId: 'seller-L4', subOrderId: 'suborder-real-4', vendorShare: 1575, platformCommission: 225 }],
      });

      expect((await paymentSplitService.getVendorBalance('seller-L4')).pendingBalance).toBe(1575);
    });

    it('is idempotent — a retried saga step does not inflate anything', async () => {
      await splitUnderSessionId('sess-link-5', 'seller-L5', 2000);

      const args = {
        paymentOrderId: 'sess-link-5',
        orderId: 'ord-real-5',
        subOrders: [{ sellerId: 'seller-L5', subOrderId: 'suborder-real-5', vendorShare: 1575, platformCommission: 225 }],
      };
      await paymentSplitService.linkSubOrders(args);
      await paymentSplitService.linkSubOrders(args);

      expect((await paymentSplitService.getVendorBalance('seller-L5')).pendingBalance).toBe(1575);
      expect((await paymentSplitService.getVendorLedger('seller-L5')).total).toBe(1);
    });

    it('links each seller of a multi-vendor basket to their own sub-order', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-sess-link-6',
        orderId: 'sess-link-6',
        subOrders: [
          { subOrderId: 'sub_sess-link-6_seller-A', sellerId: 'seller-A', subtotal: 2000 },
          { subOrderId: 'sub_sess-link-6_seller-B', sellerId: 'seller-B', subtotal: 5000 },
        ],
      });

      await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-6',
        orderId: 'ord-real-6',
        subOrders: [
          { sellerId: 'seller-A', subOrderId: 'suborder-A', vendorShare: 1575, platformCommission: 225 },
          { sellerId: 'seller-B', subOrderId: 'suborder-B', vendorShare: 4375, platformCommission: 625 },
        ],
      });

      expect((await paymentSplitService.releaseSubOrderVendorFunds('suborder-A', 'seller-A'))?.availableBalance).toBe(1575);
      expect((await paymentSplitService.releaseSubOrderVendorFunds('suborder-B', 'seller-B'))?.availableBalance).toBe(4375);
    });

    it('skips a seller whose payment never produced a ledger row', async () => {
      const { linked } = await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-7',
        orderId: 'ord-real-7',
        subOrders: [{ sellerId: 'seller-nobody', subOrderId: 'suborder-real-7', vendorShare: 999 }],
      });

      expect(linked).toBe(0);
      expect((await paymentSplitService.getVendorBalance('seller-nobody')).pendingBalance).toBe(0);
    });

    it('will not re-price a sub-order the seller has already been paid for', async () => {
      await splitUnderSessionId('sess-link-8', 'seller-L8', 2000);
      await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-8',
        orderId: 'ord-real-8',
        subOrders: [{ sellerId: 'seller-L8', subOrderId: 'suborder-real-8' }],
      });
      await paymentSplitService.releaseSubOrderVendorFunds('suborder-real-8', 'seller-L8');

      // A late re-link must not rewrite money already released.
      await paymentSplitService.linkSubOrders({
        paymentOrderId: 'sess-link-8',
        orderId: 'ord-real-8',
        subOrders: [{ sellerId: 'seller-L8', subOrderId: 'suborder-real-8', vendorShare: 1 }],
      });

      expect((await paymentSplitService.getVendorBalance('seller-L8')).availableBalance).toBe(1750);
    });
  });

  // ─── Refund reversal ──────────────────────────────────────────────────────
  //
  // Refunding returned the buyer's money and left the seller's ledger entry
  // standing, so a fully refunded order still paid the vendor.

  describe('reversing settlement on refund', () => {
    it('takes back money still pending delivery', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-ref-1',
        orderId: 'ord-ref-1',
        subOrders: [{ subOrderId: 'sub-ref-1', sellerId: 'seller-R1', subtotal: 40000 }],
      });
      expect((await paymentSplitService.getVendorBalance('seller-R1')).pendingBalance).toBe(35000);

      const { reversed, amount } = await paymentSplitService.reverseSettlement('ord-ref-1');

      expect(reversed).toBe(1);
      expect(amount).toBe(35000);
      expect((await paymentSplitService.getVendorBalance('seller-R1')).pendingBalance).toBe(0);
    });

    it('claws back money already released on delivery', async () => {
      // Delivered, then refunded. The seller must not keep it.
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-ref-2',
        orderId: 'ord-ref-2',
        subOrders: [{ subOrderId: 'sub-ref-2', sellerId: 'seller-R2', subtotal: 40000 }],
      });
      await paymentSplitService.releaseSubOrderVendorFunds('sub-ref-2', 'seller-R2');
      expect((await paymentSplitService.getVendorBalance('seller-R2')).availableBalance).toBe(35000);

      await paymentSplitService.reverseSettlement('ord-ref-2');

      expect((await paymentSplitService.getVendorBalance('seller-R2')).availableBalance).toBe(0);
    });

    it('reverses every seller in a multi-vendor order', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-ref-3',
        orderId: 'ord-ref-3',
        subOrders: [
          { subOrderId: 'sub-ref-3a', sellerId: 'seller-R3a', subtotal: 2000 },
          { subOrderId: 'sub-ref-3b', sellerId: 'seller-R3b', subtotal: 5000 },
        ],
      });

      const { reversed } = await paymentSplitService.reverseSettlement('ord-ref-3');

      expect(reversed).toBe(2);
      expect((await paymentSplitService.getVendorBalance('seller-R3a')).pendingBalance).toBe(0);
      expect((await paymentSplitService.getVendorBalance('seller-R3b')).pendingBalance).toBe(0);
    });

    it('is idempotent — a repeated refund does not double-debit', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-ref-4',
        orderId: 'ord-ref-4',
        subOrders: [{ subOrderId: 'sub-ref-4', sellerId: 'seller-R4', subtotal: 40000 }],
      });

      await paymentSplitService.reverseSettlement('ord-ref-4');
      const second = await paymentSplitService.reverseSettlement('ord-ref-4');

      expect(second.reversed).toBe(0);
      expect((await paymentSplitService.getVendorBalance('seller-R4')).pendingBalance).toBe(0);
    });

    it('leaves a reversed entry unreleasable by a later delivery event', async () => {
      // Refund then delivery is a real ordering. The seller must not be paid.
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-ref-5',
        orderId: 'ord-ref-5',
        subOrders: [{ subOrderId: 'sub-ref-5', sellerId: 'seller-R5', subtotal: 40000 }],
      });
      await paymentSplitService.reverseSettlement('ord-ref-5');

      const released = await paymentSplitService.releaseSubOrderVendorFunds('sub-ref-5', 'seller-R5');

      expect(released).toBeNull();
      expect((await paymentSplitService.getVendorBalance('seller-R5')).availableBalance).toBe(0);
    });

    it('does nothing for an order that was never settled', async () => {
      const { reversed } = await paymentSplitService.reverseSettlement('ord-never-existed');
      expect(reversed).toBe(0);
    });
  });

  // ─── Delivery event handling (integration-style) ──────────────────────────
  //
  // These drive the real consumer entry point with the exact bytes
  // order-service puts on `order-events`, rather than calling
  // releaseSubOrderVendorFunds with ids the test invented. That distinction is
  // the whole point: the release function was always correct and always tested,
  // while the consumer's delivery check could never match a real message and
  // nothing noticed for as long as no test spoke Kafka's dialect.

  describe('handleOrderMessage — a delivered order pays its seller', () => {
    /** Byte-for-byte what order-service publishes on delivery. */
    const deliveredEnvelope = (subOrderId: string, sellerId: string) => JSON.stringify({
      // Topics.ORDER_DELIVERED is 'order-events' — the same string as every
      // other order event, which is why the topic cannot discriminate.
      topic:       'order-events',
      subOrderId,
      orderId:     'ord-master-1',
      sellerId,
      vendorShare: 35000,
      amount:      45000,
      deliveredAt: new Date().toISOString(),
      _publishedAt: new Date().toISOString(),
    });

    it('moves the seller money from pending to available', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-consume-1',
        orderId: 'ord-consume-1',
        subOrders: [{ subOrderId: 'sub-consume-1', sellerId: 'seller-C1', subtotal: 40000 }],
      });
      expect((await paymentSplitService.getVendorBalance('seller-C1')).pendingBalance).toBe(35000);

      await handleOrderMessage('order-events', deliveredEnvelope('sub-consume-1', 'seller-C1'));

      const balance = await paymentSplitService.getVendorBalance('seller-C1');
      expect(balance.availableBalance).toBe(35000);
      expect(balance.pendingBalance).toBe(0);
    });

    it('completes the whole path: split under a session id, link, then deliver', async () => {
      // The full production sequence in one test. Every step keyed the way the
      // real services key it.
      const sessionId = 'sess-e2e-1';
      const sellerId  = 'seller-E2E';

      // 1. Payment clears before the order exists, so the ledger is keyed on
      //    the checkout session.
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-e2e-1',
        orderId: sessionId,
        subOrders: [{ subOrderId: `sub_${sessionId}_${sellerId}`, sellerId, subtotal: 2000 }],
      });

      // 2. order-service creates the order; the saga links its real ids and
      //    authoritative payout figures.
      await paymentSplitService.linkSubOrders({
        paymentOrderId: sessionId,
        orderId: 'ord-e2e-1',
        subOrders: [{
          sellerId,
          subOrderId: 'suborder-e2e-1',
          vendorShare: 1575,
          platformCommission: 225,
        }],
      });
      expect((await paymentSplitService.getVendorBalance(sellerId)).pendingBalance).toBe(1575);

      // 3. The courier delivers and order-service publishes.
      await handleOrderMessage('order-events', deliveredEnvelope('suborder-e2e-1', sellerId));

      const balance = await paymentSplitService.getVendorBalance(sellerId);
      expect(balance.availableBalance).toBe(1575);
      expect(balance.pendingBalance).toBe(0);
    });

    it('releases nothing when the settlement was never linked', async () => {
      // The regression itself: without the link step the delivery arrives with
      // an id the ledger has never seen, and the seller is not paid.
      const sessionId = 'sess-unlinked';
      const sellerId  = 'seller-Unlinked';

      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-unlinked',
        orderId: sessionId,
        subOrders: [{ subOrderId: `sub_${sessionId}_${sellerId}`, sellerId, subtotal: 2000 }],
      });

      await handleOrderMessage('order-events', deliveredEnvelope('suborder-never-linked', sellerId));

      const balance = await paymentSplitService.getVendorBalance(sellerId);
      expect(balance.availableBalance).toBe(0);
      expect(balance.pendingBalance).toBe(1750);   // still owed, not lost
    });

    it('also recognises a sub-order status update that reports delivery', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-consume-2',
        orderId: 'ord-consume-2',
        subOrders: [{ subOrderId: 'sub-consume-2', sellerId: 'seller-C2', subtotal: 40000 }],
      });

      await handleOrderMessage('order-events', JSON.stringify({
        topic:         'order.sub_order_updated',
        subOrderId:    'sub-consume-2',
        masterOrderId: 'ord-consume-2',
        sellerId:      'seller-C2',
        status:        'delivered',
        vendorShare:   35000,
      }));

      expect((await paymentSplitService.getVendorBalance('seller-C2')).availableBalance).toBe(35000);
    });

    it('ignores a status update that is not a delivery', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-consume-3',
        orderId: 'ord-consume-3',
        subOrders: [{ subOrderId: 'sub-consume-3', sellerId: 'seller-C3', subtotal: 40000 }],
      });

      await handleOrderMessage('order-events', JSON.stringify({
        topic:      'order.sub_order_updated',
        subOrderId: 'sub-consume-3',
        sellerId:   'seller-C3',
        status:     'in_transit',
      }));

      const balance = await paymentSplitService.getVendorBalance('seller-C3');
      expect(balance.availableBalance).toBe(0);
      expect(balance.pendingBalance).toBe(35000);
    });

    it('ignores order.created, which shares the same topic', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-consume-4',
        orderId: 'ord-consume-4',
        subOrders: [{ subOrderId: 'sub-consume-4', sellerId: 'seller-C4', subtotal: 40000 }],
      });

      await handleOrderMessage('order-events', JSON.stringify({
        topic:     'order-events',
        orderId:   'ord-consume-4',
        subOrders: [{ subOrderId: 'sub-consume-4', sellerId: 'seller-C4', vendorShare: 35000 }],
        total:     45000,
      }));

      expect((await paymentSplitService.getVendorBalance('seller-C4')).availableBalance).toBe(0);
    });

    it('does not credit twice when Kafka redelivers the same message', async () => {
      await paymentSplitService.processPaymentSplit({
        transactionId: 'pmt-consume-5',
        orderId: 'ord-consume-5',
        subOrders: [{ subOrderId: 'sub-consume-5', sellerId: 'seller-C5', subtotal: 40000 }],
      });

      const message = deliveredEnvelope('sub-consume-5', 'seller-C5');
      await handleOrderMessage('order-events', message);
      await handleOrderMessage('order-events', message);

      expect((await paymentSplitService.getVendorBalance('seller-C5')).availableBalance).toBe(35000);
    });

    it('survives a malformed message rather than killing the consumer', async () => {
      await expect(handleOrderMessage('order-events', 'not json at all')).resolves.toBeUndefined();
    });
  });

  describe('vendorPayoutService', () => {
    const mtnAccount = { accountNumber: '+256770000000', accountName: 'Seller', bankCode: 'MTN' };

    // ─── A bank transfer MUNI cannot make is not a completed payout ───────────
    //
    // There is no bank-transfer driver: nothing in this service moves money to a
    // bank account. Approving such a payout used to mark it `completed`, which
    // told the seller and every report that they had been paid when all that had
    // happened was an admin clicking approve. The transfer itself is made by a
    // human, out of band, possibly days later.

    describe('bank transfers are settled by hand, not by approval', () => {
      const bankAccount = { accountNumber: '01234567', accountName: 'Seller', bankCode: 'STANBIC' };

      async function approvedBankPayout(vendorId = 'seller-BT') {
        await prismaDouble.seedAvailableBalance(vendorId, 100000);
        const payout = await vendorPayoutService.requestPayout({
          vendorId, amount: 50000, method: 'bank_transfer', destinationAccount: bankAccount,
        });
        return vendorPayoutService.approvePayout(payout.id, 'admin-1');
      }

      it('leaves an approved bank transfer authorised, not completed', async () => {
        const approved = await approvedBankPayout();
        expect(approved.status).toBe('processing');
      });

      it('disburses nothing through a mobile money driver', async () => {
        await approvedBankPayout('seller-BT2');
        expect(mockMtnInitiateDisbursement).not.toHaveBeenCalled();
      });

      it('completes only when a human confirms the real transfer', async () => {
        const approved = await approvedBankPayout('seller-BT3');
        const settled = await vendorPayoutService.settleManually(approved.id, 'admin-1', 'STANBIC-REF-99');
        expect(settled.status).toBe('completed');
      });

      it('demands a reference from the bank, so the claim is traceable', async () => {
        const approved = await approvedBankPayout('seller-BT4');
        await expect(vendorPayoutService.settleManually(approved.id, 'admin-1', '   '))
          .rejects.toThrow();
        // Still unsettled.
        const page = await vendorPayoutService.listPayouts({ vendorId: 'seller-BT4' });
        expect(page.data[0].status).toBe('processing');
      });

      it('refuses to settle a mobile money payout by hand', async () => {
        // Those are closed by a real provider response, never by assertion.
        await prismaDouble.seedAvailableBalance('seller-MM', 100000);
        const payout = await vendorPayoutService.requestPayout({
          vendorId: 'seller-MM', amount: 50000, method: 'mobile_money', destinationAccount: mtnAccount,
        });
        await expect(vendorPayoutService.settleManually(payout.id, 'admin-1', 'REF'))
          .rejects.toThrow();
      });

      it('refuses to settle one that was never approved', async () => {
        await prismaDouble.seedAvailableBalance('seller-BT5', 100000);
        const payout = await vendorPayoutService.requestPayout({
          vendorId: 'seller-BT5', amount: 50000, method: 'bank_transfer', destinationAccount: bankAccount,
        });
        await expect(vendorPayoutService.settleManually(payout.id, 'admin-1', 'REF'))
          .rejects.toThrow();
      });

      it('cannot be settled twice', async () => {
        const approved = await approvedBankPayout('seller-BT6');
        await vendorPayoutService.settleManually(approved.id, 'admin-1', 'REF-1');
        await expect(vendorPayoutService.settleManually(approved.id, 'admin-2', 'REF-2'))
          .rejects.toThrow();
      });
    });


    it('queues a seller request for review and reserves the funds without disbursing', async () => {
      await prismaDouble.seedAvailableBalance('seller-C', 100000);

      const payout = await vendorPayoutService.requestPayout({
        vendorId: 'seller-C',
        amount: 60000,
        method: 'mobile_money',
        destinationAccount: mtnAccount,
      });

      expect(payout.id).toBeDefined();
      expect(payout.amount).toBe(60000);
      expect(payout.status).toBe('pending');
      // Reserved immediately — otherwise a seller could queue several requests
      // against the same balance and have every one of them approved.
      const balance = await paymentSplitService.getVendorBalance('seller-C');
      expect(balance.availableBalance).toBe(40000);
      expect(mockMtnInitiateDisbursement).not.toHaveBeenCalled();
    });

    it('disburses via the MTN driver once an admin approves', async () => {
      await prismaDouble.seedAvailableBalance('seller-C', 100000);
      const requested = await vendorPayoutService.requestPayout({
        vendorId: 'seller-C',
        amount: 60000,
        method: 'mobile_money',
        destinationAccount: mtnAccount,
      });

      const approved = await vendorPayoutService.approvePayout(requested.id, 'admin-1');

      expect(approved.status).toBe('completed');
      expect(approved.reviewedBy).toBe('admin-1');
      expect(mockMtnInitiateDisbursement).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 60000, phoneNumber: '256770000000' }),
      );
      const balance = await paymentSplitService.getVendorBalance('seller-C');
      expect(balance.availableBalance).toBe(40000); // stays deducted — the money left
    });

    it('restores the reserved balance when the disbursement fails', async () => {
      mockMtnGetDisbursementStatus.mockResolvedValue({ status: 'FAILED' });
      await prismaDouble.seedAvailableBalance('seller-E', 100000);

      const requested = await vendorPayoutService.requestPayout({
        vendorId: 'seller-E',
        amount: 60000,
        method: 'mobile_money',
        destinationAccount: mtnAccount,
      });
      const settled = await vendorPayoutService.approvePayout(requested.id, 'admin-1');

      expect(settled.status).toBe('failed');
      const balance = await paymentSplitService.getVendorBalance('seller-E');
      expect(balance.availableBalance).toBe(100000); // restored
    });

    it('restores the reserved balance and records the reason when an admin rejects', async () => {
      await prismaDouble.seedAvailableBalance('seller-H', 100000);
      const requested = await vendorPayoutService.requestPayout({
        vendorId: 'seller-H',
        amount: 60000,
        method: 'mobile_money',
        destinationAccount: mtnAccount,
      });

      const rejected = await vendorPayoutService.rejectPayout(requested.id, 'admin-1', 'KYC documents expired');

      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe('KYC documents expired');
      const balance = await paymentSplitService.getVendorBalance('seller-H');
      expect(balance.availableBalance).toBe(100000);
      expect(mockMtnInitiateDisbursement).not.toHaveBeenCalled();
    });

    it('refuses to approve a withdrawal that has already been actioned', async () => {
      await prismaDouble.seedAvailableBalance('seller-I', 100000);
      const requested = await vendorPayoutService.requestPayout({
        vendorId: 'seller-I',
        amount: 60000,
        method: 'mobile_money',
        destinationAccount: mtnAccount,
      });
      await vendorPayoutService.approvePayout(requested.id, 'admin-1');

      await expect(vendorPayoutService.approvePayout(requested.id, 'admin-2')).rejects.toThrow(
        /Only a pending withdrawal can be approved/,
      );
      expect(mockMtnInitiateDisbursement).toHaveBeenCalledTimes(1);
    });

    it('rejects withdrawal if requested amount exceeds available balance', async () => {
      await prismaDouble.seedAvailableBalance('seller-D', 20000);

      await expect(
        vendorPayoutService.requestPayout({
          vendorId: 'seller-D',
          amount: 50000,
          method: 'mobile_money',
          destinationAccount: mtnAccount,
        })
      ).rejects.toThrow(/Insufficient available balance/);
      expect(mockMtnInitiateDisbursement).not.toHaveBeenCalled();
    });

    it('does not let two concurrent requests both draw on the same balance', async () => {
      await prismaDouble.seedAvailableBalance('seller-J', 100000);

      const results = await Promise.allSettled([
        vendorPayoutService.requestPayout({
          vendorId: 'seller-J', amount: 60000, method: 'mobile_money', destinationAccount: mtnAccount,
        }),
        vendorPayoutService.requestPayout({
          vendorId: 'seller-J', amount: 60000, method: 'mobile_money', destinationAccount: mtnAccount,
        }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const balance = await paymentSplitService.getVendorBalance('seller-J');
      expect(balance.availableBalance).toBe(40000);
    });

    it('enforces the minimum payout amount', async () => {
      await prismaDouble.seedAvailableBalance('seller-K', 100000);

      await expect(
        vendorPayoutService.requestPayout({
          vendorId: 'seller-K', amount: 1000, method: 'mobile_money', destinationAccount: mtnAccount,
        })
      ).rejects.toThrow(/Minimum payout amount/);
    });
  });


  // ─── A settled payment stays settled ────────────────────────────────────────
  //
  // markPaymentSuccessful has always used a conditional transition, so two
  // racing successes resolve once. Its failure counterpart did not: it wrote
  // `status: 'failed'` unconditionally. Three real paths reach it after a
  // payment has already settled — the polling worker exhausting its attempts,
  // a provider poll answering FAILED alongside a successful webhook, and a
  // late duplicate failure callback — and each left the payment row reading
  // "failed" against money that had genuinely moved and a vendor already
  // credited.


  // ─── A method with no integration behind it says so ─────────────────────────
  //
  // Flutterwave and Pesapal returned a checkoutUrl built by interpolating
  // MUNI's own reference into the provider's domain. No API call was made, and
  // no such payment page exists — a customer redirected there lands on an error
  // having been told their checkout was ready. There is no driver for either
  // provider in this repository.

  describe('payment methods with no integration', () => {
    it('refuses Flutterwave rather than handing back a URL nobody issued', async () => {
      await expect(paymentGatewayService.initiatePayment({
        orderId: 'ord-flw', amount: 50000, currency: 'UGX', method: 'flutterwave',
      })).rejects.toMatchObject({ status: 503 });
    });

    it('refuses Pesapal the same way', async () => {
      await expect(paymentGatewayService.initiatePayment({
        orderId: 'ord-psp', amount: 50000, currency: 'UGX', method: 'pesapal',
      })).rejects.toMatchObject({ status: 503 });
    });

    it('says the integration is missing, not that the request was wrong', async () => {
      const err = await paymentGatewayService.initiatePayment({
        orderId: 'ord-flw2', amount: 50000, currency: 'UGX', method: 'flutterwave',
      }).catch((e) => e);
      expect(err.name).toBe('PaymentMethodUnavailableError');
      expect(err.message).toMatch(/not configured|not available/i);
    });

    it('hands back no checkout URL at all', async () => {
      const result = await paymentGatewayService.initiatePayment({
        orderId: 'ord-flw3', amount: 50000, currency: 'UGX', method: 'flutterwave',
      }).catch(() => null);
      expect(result).toBeNull();
    });

    it('still takes cash on delivery, which is genuinely implemented', async () => {
      const cod = await paymentGatewayService.initiatePayment({
        orderId: 'ord-cod', amount: 50000, currency: 'UGX', method: 'cod',
      });
      expect(cod.status).toBe('pending');
      expect(cod.checkoutUrl).toBeNull();
    });
  });

  describe('payment outcome transitions', () => {
    async function pendingPayment(reference = 'PAY-STATE-1') {
      return paymentRepository.create({
        paymentId: `pmt_${reference}`,
        reference,
        orderId: `ord-${reference}`,
        amount: 50000,
        currency: 'UGX',
        method: 'mtn_momo',
        status: 'pending',
        amountUGX: 50000,
        exchangeRate: 1,
      } as never);
    }

    it('refuses to fail a payment that has already settled', async () => {
      const payment = await pendingPayment('PAY-STATE-A');
      await markPaymentSuccessful(payment, 'provider-tx-1');

      await markPaymentFailed(
        (await paymentRepository.findByReference('PAY-STATE-A'))!,
        'provider poll timed out',
      );

      const after = await paymentRepository.findByReference('PAY-STATE-A');
      expect(after!.status).toBe('completed');
    });

    it('keeps the provider transaction id of the settlement that won', async () => {
      const payment = await pendingPayment('PAY-STATE-B');
      await markPaymentSuccessful(payment, 'provider-tx-2');
      await markPaymentFailed((await paymentRepository.findByReference('PAY-STATE-B'))!, 'late failure callback');

      const after = await paymentRepository.findByReference('PAY-STATE-B');
      expect(after!.providerTransactionId).toBe('provider-tx-2');
      expect(after!.paidAt).toBeTruthy();
    });

    it('still fails a payment that is genuinely pending', async () => {
      const payment = await pendingPayment('PAY-STATE-C');
      await markPaymentFailed(payment, 'customer declined the PIN prompt');

      const after = await paymentRepository.findByReference('PAY-STATE-C');
      expect(after!.status).toBe('failed');
      expect(after!.failureReason).toBe('customer declined the PIN prompt');
    });

    it('refuses to settle a payment that has already failed', async () => {
      const payment = await pendingPayment('PAY-STATE-D');
      await markPaymentFailed(payment, 'declined');

      await markPaymentSuccessful((await paymentRepository.findByReference('PAY-STATE-D'))!, 'late-success');

      const after = await paymentRepository.findByReference('PAY-STATE-D');
      expect(after!.status).toBe('failed');
    });

    it('credits the vendor once when a success and a failure race', async () => {
      const payment = await pendingPayment('PAY-STATE-E');
      mockPublish.mockClear();

      await Promise.all([
        markPaymentSuccessful(payment, 'provider-tx-3'),
        markPaymentFailed(payment, 'poll said failed'),
      ]);

      const succeeded = mockPublish.mock.calls.filter(
        (args) => (args as unknown[]).some((a) => JSON.stringify(a).includes('payment.succeeded')),
      );
      const failed = mockPublish.mock.calls.filter(
        (args) => (args as unknown[]).some((a) => JSON.stringify(a).includes('payment.failed')),
      );
      // Exactly one outcome is announced, never both.
      expect(succeeded.length + failed.length).toBe(1);
    });
  });

  describe('normalizeUgandaMsisdn', () => {
    it.each([
      ['0771234567', '256771234567'],
      ['+256771234567', '256771234567'],
      ['256771234567', '256771234567'],
      ['771234567', '256771234567'],
      ['077 123 4567', '256771234567'],
    ])('normalizes %s to %s', (input, expected) => {
      expect(normalizeUgandaMsisdn(input)).toBe(expected);
    });

    it('rejects an invalid phone number', () => {
      expect(() => normalizeUgandaMsisdn('12345')).toThrow(InvalidPhoneNumberError);
    });
  });

  describe('verifyHmacSignature', () => {
    const secret = 'test_webhook_secret';

    it('accepts a correctly signed payload', () => {
      const rawBody = Buffer.from(JSON.stringify({ status: 'SUCCESSFUL' }));
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      expect(verifyHmacSignature(rawBody, signature, secret)).toBe(true);
      expect(verifyHmacSignature(rawBody, `sha256=${signature}`, secret)).toBe(true); // accepts prefixed form too
    });

    it('rejects a tampered payload', () => {
      const rawBody = Buffer.from(JSON.stringify({ status: 'SUCCESSFUL' }));
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const tamperedBody = Buffer.from(JSON.stringify({ status: 'FAILED' }));

      expect(verifyHmacSignature(tamperedBody, signature, secret)).toBe(false);
    });

    it('rejects missing signature or body', () => {
      expect(verifyHmacSignature(undefined, 'abc', secret)).toBe(false);
      expect(verifyHmacSignature(Buffer.from('{}'), undefined, secret)).toBe(false);
    });
  });
});
