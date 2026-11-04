import { apiClient } from './axios.config';
import type {
  VerificationApplication,
  VerificationDecision,
  CommissionOverride,
  KycDocument,
  KycDocumentType,
  SellerTier,
} from '@/types/kyc.types';

// ─── Seller KYC / verification ────────────────────────────────────────────────
//
// Backed by auth-service:
//   GET /api/v1/admin/sellers?status=…    the review queue
//   GET /api/v1/admin/sellers/:id         one application with its documents
//   PUT /api/v1/admin/sellers/:id/verify  approve | reject | suspend | reinstate
//
// This module carried the note "No real backend — everything is backed by an
// in-memory copy of the generated mock data". Those routes existed; approving a
// seller here now actually grants them ROLE_SELLER.

export interface DecisionPayload {
  reason?: string;
  note?: string;
}

// ── Wire shapes ──

type BackendVerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

interface SellerDocumentDto {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

interface SellerProfileDto {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  businessEmail: string | null;
  businessAddress: Record<string, unknown> | null;
  verificationStatus: BackendVerificationStatus;
  verificationReason: string | null;
  createdAt: string;
  documents?: SellerDocumentDto[];
}

interface PaginatedSellers {
  sellers: SellerProfileDto[];
  total: number;
  page: number;
  limit: number;
}

// ── Mapping ──
//
// The panel's vocabulary predates the backend's. Rather than rename either
// side, the translation lives here so there is one place to look when they
// drift.

/** auth-service's DocumentType → the panel's narrower KycDocumentType. */
const DOCUMENT_TYPE: Record<string, KycDocumentType> = {
  passport:              'passport',
  national_id:           'passport',
  business_registration: 'business_license',
  tax_certificate:       'tax_id',
  bank_statement:        'bank_proof',
};

/**
 * `more_docs_requested` has no backend equivalent — auth-service models a
 * request for more documents as a rejection carrying a reason. It maps to
 * `rejected` on the way out and is displayed as a rejection on the way back;
 * distinguishing the two needs a status the backend does not have.
 */
const STATUS: Record<BackendVerificationStatus, VerificationApplication['status']> = {
  pending:   'pending',
  verified:  'approved',
  rejected:  'rejected',
  suspended: 'rejected',
};

function toDocument(dto: SellerDocumentDto): KycDocument {
  return {
    id:         dto.id,
    type:       DOCUMENT_TYPE[dto.documentType] ?? 'business_license',
    fileName:   dto.fileName,
    previewUrl: dto.fileUrl,
    uploadedAt: dto.uploadedAt,
    // auth-service tracks approval on the application, not per document, so a
    // document's status follows its application rather than being invented.
    status:     'pending',
  };
}

function toApplication(dto: SellerProfileDto): VerificationApplication {
  const address = (dto.businessAddress ?? {}) as { country?: string };

  return {
    id:            dto.id,
    sellerId:      dto.userId,
    sellerName:    dto.businessEmail ?? dto.businessName,
    businessName:  dto.businessName,
    country:       address.country ?? 'Uganda',
    // Tiering is not modelled in auth-service; every application is reviewed
    // at the entry tier until it is.
    requestedTier: 'bronze' as SellerTier,
    status:        STATUS[dto.verificationStatus] ?? 'pending',
    submittedAt:   dto.createdAt,
    documents:     (dto.documents ?? []).map(toDocument),
    notes:         dto.verificationReason ?? undefined,
  };
}

const DECISION_ACTION: Record<VerificationDecision, 'approve' | 'reject'> = {
  approve:           'approve',
  reject:            'reject',
  request_more_docs: 'reject',
};

export const verificationApi = {
  listApplications: async (): Promise<VerificationApplication[]> => {
    // The whole queue, not just pending — the panel filters client-side and
    // shows recently decided applications alongside outstanding ones.
    const { data } = await apiClient.get<PaginatedSellers>('/admin/sellers', {
      params: { limit: 100 },
    });
    return (data.sellers ?? []).map(toApplication);
  },

  getApplication: async (id: string): Promise<VerificationApplication | undefined> => {
    const { data } = await apiClient.get<SellerProfileDto>(
      `/admin/sellers/${encodeURIComponent(id)}`,
    );
    return data ? toApplication(data) : undefined;
  },

  decideApplication: async (
    id: string,
    decision: VerificationDecision,
    payload: DecisionPayload = {},
  ): Promise<VerificationApplication> => {
    await apiClient.put(`/admin/sellers/${encodeURIComponent(id)}/verify`, {
      action: DECISION_ACTION[decision],
      reason: payload.reason ?? payload.note,
    });

    // Re-read rather than trusting the decision response: the verify endpoint
    // returns its own summary shape, and the panel wants the full application
    // with documents so the row it re-renders is the real current state.
    const refreshed = await verificationApi.getApplication(id);
    if (!refreshed) throw new Error(`Verification application ${id} not found`);
    return refreshed;
  },

  /**
   * STILL MOCKED — no commission-override endpoint exists.
   *
   * Per-seller, per-category commission overrides are not modelled anywhere in
   * the backend: product-service now stores a commission per category (one
   * rate for everyone) and auth-service stores none. Backing this means a new
   * table and routes, which is a feature rather than a wiring job.
   *
   * Kept in memory so the screen still works, and marked here so the gap is
   * visible rather than looking like working persistence.
   */
  setCommissionOverride: async (override: CommissionOverride): Promise<CommissionOverride> => {
    commissionOverrides = [
      override,
      ...commissionOverrides.filter(
        (o) => !(o.sellerId === override.sellerId && o.categoryId === override.categoryId),
      ),
    ];
    return override;
  },

  listCommissionOverrides: async (): Promise<CommissionOverride[]> => [...commissionOverrides],
};

/** See the note on setCommissionOverride — session-scoped, not persisted. */
let commissionOverrides: CommissionOverride[] = [];
