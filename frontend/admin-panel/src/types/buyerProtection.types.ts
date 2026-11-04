export type ClaimStatus = 'open' | 'under_review' | 'evidence_requested' | 'resolved_refund' | 'resolved_denied';

export type EvidenceType = 'chat_log' | 'shipping_proof' | 'photo' | 'invoice';

export interface ClaimEvidence {
  id: string;
  type: EvidenceType;
  label: string;
  submittedBy: 'buyer' | 'seller' | 'system';
  url: string;
  submittedAt: string;
}

export interface ProtectionClaim {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  reason: string;
  amount: number;
  currency: string;
  status: ClaimStatus;
  openedAt: string;
  evidence: ClaimEvidence[];
}

export type RefundDecision = 'full_refund' | 'partial_refund' | 'deny' | 'chargeback_release';
