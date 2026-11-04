export type SellerTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type KycDocumentType = 'passport' | 'business_license' | 'tax_id' | 'bank_proof';

export type KycDocumentStatus = 'pending' | 'verified' | 'rejected';

export interface KycDocument {
  id: string;
  type: KycDocumentType;
  fileName: string;
  previewUrl: string;
  uploadedAt: string;
  status: KycDocumentStatus;
}

export type VerificationApplicationStatus = 'pending' | 'approved' | 'rejected' | 'more_docs_requested';

export interface VerificationApplication {
  id: string;
  sellerId: string;
  sellerName: string;
  businessName: string;
  country: string;
  requestedTier: SellerTier;
  status: VerificationApplicationStatus;
  submittedAt: string;
  documents: KycDocument[];
  notes?: string;
}

export type VerificationDecision = 'approve' | 'reject' | 'request_more_docs';

export const REJECTION_REASON_TEMPLATES = [
  'Document image is unclear or low resolution',
  'Business name does not match registration documents',
  'Tax ID could not be verified against national registry',
  'Bank account proof does not match business name',
  'Submitted document has expired',
  'Suspected duplicate or fraudulent application',
] as const;

export interface CommissionOverride {
  sellerId: string;
  categoryId: string | null;
  tier: SellerTier;
  commissionRatePercent: number;
  effectiveFrom: string;
  reason?: string;
}
