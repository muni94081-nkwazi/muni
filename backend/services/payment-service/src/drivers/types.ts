// ─── Mobile Money Driver Contract ───────────────────────────────────────────
//
// Both MTN MoMo and Airtel Money implement this same shape so the rest of
// the service (gateway.service.ts, payout.service.ts, the polling worker)
// can treat "collect from a customer" / "pay out to a customer" identically
// regardless of provider.

export type ProviderPollStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export type MobileMoneyProvider = 'mtn_momo' | 'airtel_money';

export interface CollectionRequestParams {
  /** Amount in the settlement currency (UGX), integer shillings. */
  amount: number;
  /** Customer MSISDN, already normalised to 256XXXXXXXXX. */
  phoneNumber: string;
  /** Our internal payment reference — sent to the provider as externalId/reference. */
  externalId: string;
  payerMessage?: string;
  payeeNote?: string;
}

export interface CollectionRequestResult {
  /** The ID we must use to poll status (X-Reference-Id for MTN, transaction id for Airtel). */
  providerReferenceId: string;
  status: 'PENDING';
}

export interface CollectionStatusResult {
  status: ProviderPollStatus;
  providerTransactionId?: string;
  /** Failure code/message from the provider, when status is FAILED. */
  reason?: string;
  raw?: unknown;
}

export interface DisbursementParams {
  amount: number;
  phoneNumber: string;
  externalId: string;
  payerMessage?: string;
  payeeNote?: string;
}

export interface DisbursementResult {
  providerReferenceId: string;
  status: 'PENDING';
}

export interface DisbursementStatusResult {
  status: ProviderPollStatus;
  providerTransactionId?: string;
  reason?: string;
  raw?: unknown;
}

export interface MobileMoneyDriver {
  readonly provider: MobileMoneyProvider;

  /** Collections: push a "request to pay" prompt to the customer's phone. */
  initiateCollection(params: CollectionRequestParams): Promise<CollectionRequestResult>;
  getCollectionStatus(providerReferenceId: string): Promise<CollectionStatusResult>;

  /** Disbursements: pay out from the merchant wallet to a customer/vendor. */
  initiateDisbursement(params: DisbursementParams): Promise<DisbursementResult>;
  getDisbursementStatus(providerReferenceId: string): Promise<DisbursementStatusResult>;
}

/** Thrown for any non-2xx response from a provider API, or a malformed provider response. */
export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly provider: MobileMoneyProvider,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ProviderApiError';
  }
}
