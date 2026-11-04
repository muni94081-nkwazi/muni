export type PaymentMethod = 'mtn_momo' | 'airtel' | 'card' | 'visa_card' | 'pesapal' | 'flutterwave' | 'cod';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export type CardBrand = 'VISA' | 'MASTERCARD';

/**
 * 3DS2 authentication state for a card transaction. `CHALLENGE_REQUIRED`
 * means the issuer's ACS demands step-up authentication (OTP/biometric) —
 * the frontend must present `PaymentTransaction.threeDSecureRedirectUrl` in
 * an iframe/webview and wait for the ACS to redirect back to our 3DS return
 * callback before the payment can be considered settled.
 */
export type ThreeDSecureStatus = 'CHALLENGE_REQUIRED' | 'AUTHENTICATED' | 'REJECTED';

/**
 * Card-specific transaction metadata. Deliberately excludes the PAN, full
 * expiry, and CVC — PCI-DSS SAQ A-EP scope requires those never reach this
 * backend; only the client-side-generated `cardToken` and the last4/brand
 * derived from it are persisted here.
 */
export interface CardTransactionMetadata {
  last4: string;
  brand: CardBrand;
  expiryMonth: string;
  expiryYear: string;
  cardToken: string;
  threeDSecureStatus?: ThreeDSecureStatus | null;
  /** Gateway authorization id — used to capture/refund and to re-query 3DS outcome. */
  authorizationId?: string | null;
  captureId?: string | null;
}

/**
 * Fine-grained provider-side status for mobile money collections, tracked
 * alongside the platform-wide `PaymentStatus` (which stays stable for other
 * services to consume). `PENDING_USER_PIN_PROMPT` is set the moment MTN/
 * Airtel accept a "request to pay" and the customer has been sent a PIN
 * prompt — this is exactly the state the Redis polling worker watches.
 */
export type ProviderStatus = 'PENDING_USER_PIN_PROMPT' | 'SUCCESSFUL' | 'FAILED';

export type MobileMoneyProviderName = 'mtn_momo' | 'airtel_money';

export interface PaymentTransaction {
  paymentId: string;
  reference: string;
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  phoneNumber?: string | null;
  checkoutUrl?: string | null;
  idempotencyKey?: string | null;
  rawPayload?: Record<string, unknown> | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;

  // ─── Mobile money provider integration fields ──────────────────────────
  /** Which mobile money network is handling this collection, if any. */
  provider?: MobileMoneyProviderName | null;
  /** The ID used to poll the provider for status (MTN X-Reference-Id / Airtel transaction id). */
  providerReferenceId?: string | null;
  /** Provider's own settlement transaction ID, once known. */
  providerTransactionId?: string | null;
  /** Fine-grained provider status — see `ProviderStatus`. */
  providerStatus?: ProviderStatus | null;
  /** Populated when providerStatus is FAILED. */
  failureReason?: string | null;
  /** Amount converted to the settlement currency (UGX), if `currency` differed. */
  amountUGX?: number | null;
  /** Exchange rate applied to produce `amountUGX` (1 if no conversion was needed). */
  exchangeRate?: number | null;
  /** Number of times the polling worker has checked this payment's status. */
  pollAttempts?: number;

  // ─── Visa/Mastercard card integration fields ───────────────────────────
  /** Populated once a card charge has been tokenized/authorized. */
  card?: CardTransactionMetadata | null;
  /** 3DS2 challenge iframe/webview URL, present while threeDSecureStatus is CHALLENGE_REQUIRED. */
  threeDSecureRedirectUrl?: string | null;
}

export type EscrowStatus = 'in_escrow' | 'dispute_hold' | 'released_to_vendor' | 'refunded_to_buyer';

export interface EscrowHoldEntry {
  id: string;
  orderId: string;
  subOrderId?: string | null;
  vendorId: string;
  buyerId: string;
  amountUGX: number;
  status: EscrowStatus;
  autoReleaseDate: string; // 7 days after delivery
  holdReason?: string;
  releasedAt?: string | null;
  createdAt: string;
}

export interface VendorBalance {
  vendorId: string;
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  updatedAt: string;
}

export interface VendorLedgerEntry {
  id: string;
  transactionId: string;
  orderId: string;
  subOrderId?: string | null;
  vendorId: string;
  grossAmount: number;
  platformFee: number;
  netVendorAmount: number;
  status: 'pending' | 'available' | 'paid_out' | 'reversed';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformCommissionEntry {
  id: string;
  orderId: string;
  subOrderId?: string | null;
  vendorId: string;
  grossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  createdAt: string;
}

export type PayoutMethod = 'mobile_money' | 'bank_transfer';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

export interface PayoutDestinationAccount {
  accountNumber: string;
  accountName: string;
  bankCode?: string;
}

export interface VendorPayout {
  id: string;
  vendorId: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  destinationAccount: PayoutDestinationAccount;
  status: PayoutStatus;
  reference: string;
  requestedBy: 'seller' | 'system_scheduled';
  createdAt: string;
  updatedAt: string;
  processedAt?: string | null;
  failureReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
}
