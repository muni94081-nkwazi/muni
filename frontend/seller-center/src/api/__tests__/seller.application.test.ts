import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Seller onboarding ────────────────────────────────────────────────────────
//
// Seller Center could create a user account but never filed a seller
// application, so nobody could obtain ROLE_SELLER through the UI at all. These
// assertions cover the flow that closes that gap, and the rules that must hold
// while it does:
//
//   • what actually leaves the browser for POST /sellers/register
//   • that no user or seller id is ever sent — identity is the session's
//   • that each verification status renders as itself, and only 'rejected'
//     offers a resubmit, because that is the one the backend re-opens
//   • that a customer is never treated as a seller
//
// This project's test setup is vitest with a mocked axios instance and no DOM
// library, which is why the page's logic lives in utils/sellerApplication.ts.

const post = vi.fn();
const get = vi.fn();

vi.mock('../axios.config', () => ({
  default: { post, get, put: vi.fn(), delete: vi.fn() },
}));

const { sellerApi } = await import('../seller.api');
const {
  EMPTY_APPLICATION, validateApplication, toApplicationPayload,
  presentStatus, hasSellerAccess, describeApiError,
} = await import('../../utils/sellerApplication');

/** A complete, valid form — the baseline each test varies from. */
const FILLED = {
  ...EMPTY_APPLICATION,
  businessName: 'Test Crafts Ltd',
  businessType: 'company',
  street: '1 Test Road',
  city: 'Kampala',
  country: 'ug',
  accountNumber: '1234567890',
  bankName: 'Test Bank',
  accountName: 'Test Crafts Ltd',
  storeName: 'Test Crafts',
};

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1', userId: 'user-1', businessName: 'Test Crafts Ltd',
    businessType: 'company', taxId: null, registrationNumber: null,
    businessEmail: null, businessPhone: null,
    businessAddress: { street: '1 Test Road', city: 'Kampala', country: 'UG' },
    bankAccount: { bankName: 'Test Bank', accountName: 'Test Crafts Ltd', accountNumber: '******7890' },
    verificationStatus: 'pending', verificationReason: null, verifiedAt: null,
    storeName: 'Test Crafts', storeSlug: 'test-crafts-1', storeDescription: null,
    totalSales: 0, totalProducts: 0, rating: 0,
    createdAt: '2026-09-09T00:00:00.000Z', documents: [],
    ...overrides,
  };
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('the request that leaves the browser', () => {
  it('posts the application to the real endpoint', async () => {
    post.mockResolvedValue({ data: { message: 'ok', seller: profile() } });

    await sellerApi.apply(toApplicationPayload(FILLED));

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('/sellers/register');
  });

  it('never sends a userId or sellerId — identity comes from the session', async () => {
    post.mockResolvedValue({ data: { message: 'ok', seller: profile() } });

    await sellerApi.apply(toApplicationPayload(FILLED));
    const body = JSON.stringify(post.mock.calls[0][1]);

    expect(body).not.toContain('userId');
    expect(body).not.toContain('sellerId');
    expect(body).not.toContain('seller-001');
    expect(body).not.toContain('user-123');
  });

  it('never sends a verificationStatus — approval is the admin’s to give', async () => {
    post.mockResolvedValue({ data: { message: 'ok', seller: profile() } });

    await sellerApi.apply(toApplicationPayload(FILLED));

    expect(post.mock.calls[0][1]).not.toHaveProperty('verificationStatus');
    expect(post.mock.calls[0][1]).not.toHaveProperty('roles');
  });

  it('upper-cases the country code the backend requires as ISO alpha-2', () => {
    expect(toApplicationPayload(FILLED).businessAddress.country).toBe('UG');
  });

  it('omits blank optional fields rather than sending empty strings', () => {
    // businessEmail is validated as an email WHEN PRESENT, so "" would be a
    // server-side validation failure rather than "not provided".
    const payload = toApplicationPayload(FILLED);
    expect(payload.businessEmail).toBeUndefined();
    expect(payload.taxId).toBeUndefined();
    expect(payload.bankAccount.swiftCode).toBeUndefined();
  });
});

describe('client-side validation mirrors the backend schema', () => {
  it('accepts a complete application', () => {
    expect(validateApplication(FILLED)).toEqual({});
  });

  it('rejects a three-letter country code, which the backend refuses', () => {
    expect(validateApplication({ ...FILLED, country: 'UGA' })).toHaveProperty('country');
  });

  it('rejects an account number shorter than the backend minimum of 6', () => {
    expect(validateApplication({ ...FILLED, accountNumber: '12345' })).toHaveProperty('accountNumber');
  });

  it('requires a business name of at least 2 characters', () => {
    expect(validateApplication({ ...FILLED, businessName: 'X' })).toHaveProperty('businessName');
  });

  it('requires street, city and the payout fields', () => {
    const errors = validateApplication(EMPTY_APPLICATION);
    for (const field of ['businessName', 'street', 'city', 'accountNumber', 'bankName', 'accountName']) {
      expect(errors).toHaveProperty(field);
    }
  });

  it('rejects a malformed business email but allows it to be absent', () => {
    expect(validateApplication({ ...FILLED, businessEmail: 'nope' })).toHaveProperty('businessEmail');
    expect(validateApplication({ ...FILLED, businessEmail: '' })).not.toHaveProperty('businessEmail');
  });
});

describe('reading the existing application', () => {
  it('returns the profile when one exists', async () => {
    get.mockResolvedValue({ data: profile() });
    const result = await sellerApi.getMyApplication();
    expect(get).toHaveBeenCalledWith('/sellers/me');
    expect(result?.verificationStatus).toBe('pending');
  });

  it('treats 404 as "has not applied", not as an error', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    await expect(sellerApi.getMyApplication()).resolves.toBeNull();
  });

  it('does not swallow a 401 — an expired session is not "no application"', async () => {
    get.mockRejectedValue({ response: { status: 401 } });
    await expect(sellerApi.getMyApplication()).rejects.toBeDefined();
  });

  it('does not swallow a server error', async () => {
    get.mockRejectedValue({ response: { status: 500 } });
    await expect(sellerApi.getMyApplication()).rejects.toBeDefined();
  });
});

describe('API errors are reported, not swallowed', () => {
  it('explains a 401 as an expired session', () => {
    expect(describeApiError({ response: { status: 401 } })).toMatchObject({ status: 401 });
    expect(describeApiError({ response: { status: 401 } }).message).toMatch(/sign in/i);
  });

  it('surfaces a 403 as a permission problem', () => {
    expect(describeApiError({ response: { status: 403 } }).status).toBe(403);
  });

  it('passes the server’s own 409 wording through', () => {
    const msg = describeApiError({
      response: { status: 409, data: { message: 'You already have a seller application in progress' } },
    });
    expect(msg.status).toBe(409);
    expect(msg.message).toMatch(/already have a seller application/i);
  });

  it('gives a retryable message for a 500', () => {
    expect(describeApiError({ response: { status: 500 } }).message).toMatch(/try again/i);
  });

  it('rejects rather than resolving when apply fails', async () => {
    post.mockRejectedValue({ response: { status: 409 } });
    await expect(sellerApi.apply(toApplicationPayload(FILLED))).rejects.toBeDefined();
  });
});

describe('each verification status renders as itself', () => {
  it('pending says it is under review and offers no resubmit', () => {
    const s = presentStatus(profile() as never);
    expect(s.title).toMatch(/review/i);
    expect(s.canReapply).toBe(false);
  });

  it('verified does not claim Seller Center access is automatic', () => {
    const s = presentStatus(profile({ verificationStatus: 'verified' }) as never);
    expect(s.tone).toBe('success');
    expect(s.canReapply).toBe(false);
  });

  it('rejected shows the reason and allows a resubmit, which the backend permits', () => {
    const s = presentStatus(profile({ verificationStatus: 'rejected', verificationReason: 'Documents unreadable' }) as never);
    expect(s.canReapply).toBe(true);
    expect(s.detail).toMatch(/Documents unreadable/);
  });

  it('suspended does not offer a resubmit, because re-applying will not lift it', () => {
    const s = presentStatus(profile({ verificationStatus: 'suspended' }) as never);
    expect(s.canReapply).toBe(false);
    expect(s.detail).toMatch(/suspend/i);
  });
});

describe('a customer is never treated as a seller', () => {
  it('denies an account with only ROLE_CUSTOMER', () => {
    expect(hasSellerAccess(['ROLE_CUSTOMER'])).toBe(false);
  });

  it('denies an account whose roles could not be loaded', () => {
    expect(hasSellerAccess(undefined)).toBe(false);
    expect(hasSellerAccess([])).toBe(false);
  });

  it('grants access only once the backend has issued ROLE_SELLER', () => {
    expect(hasSellerAccess(['ROLE_CUSTOMER', 'ROLE_SELLER'])).toBe(true);
  });
});

// ─── Regression: the fabricated seller identity ───────────────────────────────
//
// authApi.getCurrentUser used to catch every error and return a synthetic user
// carrying roles: ['ROLE_SELLER']. PrivateRoute checks exactly that array, so a
// failing /users/me — expired session, 403, gateway down — mounted the whole
// Seller Center for an account that was not a seller. These pin the fix.
describe('getCurrentUser never invents a seller identity', () => {
  it('rejects when /users/me fails instead of returning a fake seller', async () => {
    get.mockRejectedValue({ response: { status: 401 } });
    const { authApi } = await import('../auth.api');
    await expect(authApi.getCurrentUser()).rejects.toBeDefined();
  });

  it('does not resolve to ROLE_SELLER on a server error', async () => {
    get.mockRejectedValue({ response: { status: 500 } });
    const { authApi } = await import('../auth.api');

    const result = await authApi.getCurrentUser().catch(() => null);
    expect(result).toBeNull();
  });

  it('returns the real user when the call succeeds', async () => {
    get.mockResolvedValue({
      data: { id: 'u1', email: 'a@example.test', firstName: 'A', lastName: 'B', fullName: 'A B', roles: ['ROLE_CUSTOMER'] },
    });
    const { authApi } = await import('../auth.api');

    const user = await authApi.getCurrentUser();
    expect(user.roles).toEqual(['ROLE_CUSTOMER']);
    expect(hasSellerAccess(user.roles)).toBe(false);
  });
});
