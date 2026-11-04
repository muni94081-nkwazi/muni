import axiosInstance from './axios.config';

// ─── Seller Application API ───────────────────────────────────────────────────
//
// The two endpoints auth-service exposes for a seller's own application:
//
//   POST /api/v1/sellers/register   submit an application  (gateway: pub, but
//                                   auth-service requires the gateway-stamped
//                                   identity, so an anonymous call is 401)
//   GET  /api/v1/sellers/me         the caller's own application + documents
//
// No seller or user id is ever sent from here. The gateway stamps x-user-id
// from the verified JWT and auth-service scopes both calls by it — a userId in
// the body is stripped by the backend's Zod schema and ignored, which is what
// stops an application being filed against someone else's account.
//
// Field names and constraints below mirror `sellerRegisterSchema` in
// backend/shared/validators/common.ts exactly. Anything not in that schema is
// dropped by the server, so inventing fields here would silently do nothing.

/** Matches the backend `VerificationStatus` enum. */
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

/** Matches the backend `businessType` enum. */
export type BusinessType = 'individual' | 'company' | 'partnership';

export interface SellerAddress {
  street: string;
  city: string;
  region?: string;
  /** ISO 3166-1 alpha-2, exactly two characters — the backend enforces this. */
  country: string;
  postalCode?: string;
}

export interface SellerBankAccount {
  /** Minimum 6 characters server-side. */
  accountNumber: string;
  bankName: string;
  accountName: string;
  swiftCode?: string;
}

export interface SellerApplicationInput {
  businessName: string;
  businessType: BusinessType;
  taxId?: string;
  registrationNumber?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress: SellerAddress;
  bankAccount: SellerBankAccount;
  storeName?: string;
  storeDescription?: string;
}

/**
 * What the server returns. `bankAccount.accountNumber` comes back MASKED
 * (`******7890`) — auth-service's toPublicProfile does that, and this app must
 * not try to reconstruct or re-submit it.
 */
export interface SellerProfile {
  id: string;
  userId: string;
  businessName: string;
  businessType: BusinessType;
  taxId: string | null;
  registrationNumber: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  businessAddress: SellerAddress;
  bankAccount: { bankName: string; accountName: string; accountNumber: string };
  verificationStatus: VerificationStatus;
  verificationReason: string | null;
  verifiedAt: string | null;
  storeName: string | null;
  storeSlug: string | null;
  storeDescription: string | null;
  totalSales: number;
  totalProducts: number;
  rating: number;
  createdAt: string;
  documents: Array<{ id: string; documentType: string; fileName: string; uploadedAt: string }>;
}

export interface SellerApplicationResult {
  message: string;
  seller: SellerProfile;
}

export const sellerApi = {
  /**
   * Submit a seller application. 201 on success, 409 when one already exists.
   *
   * Errors are deliberately NOT caught here: the page needs the status code to
   * tell "already applied" from "not signed in" from "server broke", and a
   * swallowed error would leave the caller unable to say which happened.
   */
  apply: async (input: SellerApplicationInput): Promise<SellerApplicationResult> => {
    const { data } = await axiosInstance.post<SellerApplicationResult>('/sellers/register', input);
    return data;
  },

  /**
   * The caller's own application, or null when they have not applied.
   *
   * A 404 is the documented "no profile yet" answer, so it is translated to
   * null rather than thrown — that is a state the page renders, not a failure.
   * Every other status still throws so it can be reported.
   */
  getMyApplication: async (): Promise<SellerProfile | null> => {
    try {
      const { data } = await axiosInstance.get<SellerProfile>('/sellers/me');
      return data;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 404) return null;
      throw error;
    }
  },
};
