export type CodVerificationStatus = 'PENDING' | 'VERIFIED' | 'SHORT' | 'DISPUTED';

export interface CodCollection {
  id: string;
  fulfillmentId: string;
  orderId: string;
  riderId: string;
  amountDue: number;
  amountCollected: number;
  currency: string;
  variance: number; // amountCollected - amountDue
  verificationStatus: CodVerificationStatus;
  notes?: string;
  collectedAt: string;
}

export type LedgerStatus = 'OPEN' | 'RECONCILED' | 'FLAGGED';

export interface CashLedgerEntry {
  riderId: string;
  date: string; // YYYY-MM-DD, EAT calendar day
  totalDue: number;
  totalCollected: number;
  totalRemitted: number;
  variance: number; // totalCollected - totalRemitted
  collectionIds: string[];
  status: LedgerStatus;
  reconciledAt?: string;
  reconciledBy?: string;
}
