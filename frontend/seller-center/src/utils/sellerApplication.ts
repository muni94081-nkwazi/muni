import type { SellerApplicationInput, SellerProfile, VerificationStatus } from '@/api/seller.api';

// ─── Seller application logic ─────────────────────────────────────────────────
//
// Pulled out of the page so it can be tested without rendering: this project's
// test setup is vitest with mocked axios and no DOM library, so logic that only
// exists inside a component is logic that cannot be covered.
//
// Validation here mirrors `sellerRegisterSchema` (backend/shared/validators/
// common.ts). It exists to give useful field-level messages before a round
// trip — the server remains the authority and its 4xx is always surfaced.

export interface ApplicationFormValues {
  businessName: string;
  businessType: string;
  taxId: string;
  registrationNumber: string;
  businessEmail: string;
  businessPhone: string;
  street: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  swiftCode: string;
  storeName: string;
  storeDescription: string;
}

export const EMPTY_APPLICATION: ApplicationFormValues = {
  businessName: '', businessType: 'individual', taxId: '', registrationNumber: '',
  businessEmail: '', businessPhone: '',
  street: '', city: '', region: '', country: 'UG', postalCode: '',
  accountNumber: '', bankName: '', accountName: '', swiftCode: '',
  storeName: '', storeDescription: '',
};

/** Field-level errors, keyed by form field. Empty object means valid. */
export function validateApplication(v: ApplicationFormValues): Record<string, string> {
  const e: Record<string, string> = {};

  if (v.businessName.trim().length < 2) e.businessName = 'Business name must be at least 2 characters';
  else if (v.businessName.trim().length > 200) e.businessName = 'Business name must be 200 characters or fewer';

  if (!['individual', 'company', 'partnership'].includes(v.businessType)) {
    e.businessType = 'Choose a business type';
  }

  if (!v.street.trim()) e.street = 'Street address is required';
  if (!v.city.trim()) e.city = 'City is required';
  // Two letters exactly — the backend rejects "UGA" and "Uganda".
  if (!/^[A-Za-z]{2}$/.test(v.country.trim())) e.country = 'Use the 2-letter country code, e.g. UG';

  if (v.accountNumber.trim().length < 6) e.accountNumber = 'Account number must be at least 6 characters';
  if (v.bankName.trim().length < 2) e.bankName = 'Bank name is required';
  if (v.accountName.trim().length < 2) e.accountName = 'Account holder name is required';

  if (v.businessEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.businessEmail.trim())) {
    e.businessEmail = 'Enter a valid email address';
  }
  if (v.storeName.trim() && v.storeName.trim().length < 2) {
    e.storeName = 'Store name must be at least 2 characters';
  }
  if (v.storeDescription.length > 500) {
    e.storeDescription = 'Description must be 500 characters or fewer';
  }

  return e;
}

/**
 * Build the request body.
 *
 * Optional fields are omitted rather than sent as empty strings: the backend
 * validates `businessEmail` as an email when present, so `""` would be a
 * validation failure instead of "not provided".
 */
export function toApplicationPayload(v: ApplicationFormValues): SellerApplicationInput {
  const trimmed = (s: string) => s.trim();
  const optional = (s: string) => (s.trim() ? s.trim() : undefined);

  return {
    businessName: trimmed(v.businessName),
    businessType: v.businessType as SellerApplicationInput['businessType'],
    taxId: optional(v.taxId),
    registrationNumber: optional(v.registrationNumber),
    businessEmail: optional(v.businessEmail),
    businessPhone: optional(v.businessPhone),
    businessAddress: {
      street: trimmed(v.street),
      city: trimmed(v.city),
      region: optional(v.region),
      country: trimmed(v.country).toUpperCase(),
      postalCode: optional(v.postalCode),
    },
    bankAccount: {
      accountNumber: trimmed(v.accountNumber),
      bankName: trimmed(v.bankName),
      accountName: trimmed(v.accountName),
      swiftCode: optional(v.swiftCode),
    },
    storeName: optional(v.storeName),
    storeDescription: optional(v.storeDescription),
  };
}

/** How each verification status is presented, and whether it is a dead end. */
export interface StatusPresentation {
  title: string;
  detail: string;
  tone: 'pending' | 'success' | 'error' | 'warning';
  /** True when the seller may submit a fresh application. */
  canReapply: boolean;
}

export function presentStatus(profile: SellerProfile): StatusPresentation {
  const reason = profile.verificationReason ? ` Reason given: ${profile.verificationReason}` : '';

  switch (profile.verificationStatus) {
    case 'pending':
      return {
        title: 'Application under review',
        detail: 'Your application has been submitted and is waiting for a MUNI administrator to review it. You will get access to the Seller Center once it is approved.',
        tone: 'pending',
        canReapply: false,
      };
    case 'verified':
      return {
        title: 'Application approved',
        detail: 'Your seller account is active. If the Seller Center still says access is required, sign out and back in so your session picks up the seller role.',
        tone: 'success',
        canReapply: false,
      };
    case 'rejected':
      // The backend allows re-applying after a rejection: registerSeller
      // updates the existing row instead of throwing 409.
      return {
        title: 'Application not approved',
        detail: `This application was not approved.${reason} You can correct the details and submit it again.`,
        tone: 'error',
        canReapply: true,
      };
    case 'suspended':
      return {
        title: 'Seller account suspended',
        detail: `This seller account has been suspended.${reason} Contact MUNI support to discuss reinstatement — re-applying will not lift a suspension.`,
        tone: 'warning',
        canReapply: false,
      };
    default:
      return {
        title: 'Application status unavailable',
        detail: 'We could not interpret the status returned for this application.',
        tone: 'warning',
        canReapply: false,
      };
  }
}

/** True when the account may use the Seller Center. Role is the authority. */
export function hasSellerAccess(roles: string[] | undefined): boolean {
  return Array.isArray(roles) && roles.includes('ROLE_SELLER');
}

/** Human-readable message for an API failure, without swallowing the cause. */
export function describeApiError(error: unknown): { status?: number; message: string } {
  const err = error as {
    response?: { status?: number; data?: { message?: string; error?: { message?: string } } };
    message?: string;
  };
  const status = err.response?.status;
  const serverMessage = err.response?.data?.message ?? err.response?.data?.error?.message;

  if (status === 401) {
    return { status, message: 'Your session has expired. Please sign in again to continue.' };
  }
  if (status === 403) {
    return { status, message: serverMessage ?? 'This account is not allowed to submit a seller application.' };
  }
  if (status === 409) {
    return { status, message: serverMessage ?? 'You already have a seller application in progress.' };
  }
  if (status && status >= 500) {
    return { status, message: 'MUNI could not process the application right now. Please try again in a moment.' };
  }
  return { status, message: serverMessage ?? err.message ?? 'Something went wrong. Please try again.' };
}

export type { VerificationStatus };
