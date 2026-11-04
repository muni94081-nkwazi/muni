import { randomUUID } from 'node:crypto';
import { http, auth, expectStatus } from './client.js';
import { promoteToAdmin, setVariantStock } from './db.js';
import { totpCode } from './totp.js';

// ─── Seeding ──────────────────────────────────────────────────────────────────
//
// The purchase flow needs more setup than "create a product". Two gates the
// system enforces that a naive script walks straight into:
//
//   • ROLE_SELLER is granted by admin verification, not at signup. A freshly
//     registered account cannot create products.
//   • A seller's product is created PENDING_APPROVAL and needs admin
//     moderation. checkout-service prices lines through
//     GET /products/:id/variants/:variantId, which only returns variants whose
//     product is ACTIVE — so an unmoderated product is unbuyable, and the
//     checkout fails at pricing with "no longer available".
//
// And one that shapes the whole helper: MFA_REQUIRED_ROLES covers ROLE_SELLER
// and ROLE_ADMIN, so once an account is privileged it cannot log in with a
// password alone. Both are enrolled through the real 2FA endpoints.

/** A password that satisfies auth-service's 12-char complexity policy. */
function testPassword(): string {
  // Generated per run, never committed. The policy needs upper, lower, digit
  // and symbol.
  return `E2e!${randomUUID().slice(0, 12)}Aa1#`;
}

export interface TestUser {
  email: string;
  password: string;
  userId: string;
  token: string;
  totpSecret?: string;
}

/** Register a plain account and return its access token. */
export async function registerUser(label: string): Promise<TestUser> {
  const email = `e2e-${label}-${randomUUID().slice(0, 8)}@muni.test`;
  const password = testPassword();

  const res = await http.post('/auth/register', {
    email,
    password,
    firstName: 'E2E',
    lastName: label,
  });
  expectStatus(res, 201, `register ${label}`);

  // Confirmed flat, not wrapped: auth.service's buildAuthResponse returns
  // { accessToken, refreshToken, tokenType, expiresIn, user } and the
  // controller does `res.status(201).json(result)`.
  const token: string = res.data.accessToken;
  const userId: string = res.data.user.id;

  if (!token || !userId) {
    throw new Error(
      `[e2e] register ${label} returned no token/userId: ${JSON.stringify(res.data)}`,
    );
  }

  return { email, password, userId, token };
}

/**
 * Enrol an authenticator and log in through the MFA challenge.
 *
 * Required once an account holds ROLE_SELLER or ROLE_ADMIN: auth-service
 * answers a password login with MFA_ENROLLMENT_REQUIRED and issues no tokens
 * until a secret is verified.
 */
export async function enrolMfaAndLogin(user: TestUser): Promise<TestUser> {
  // Enrol against the token issued at signup. It stays valid — it is a signed
  // JWT, unaffected by the role change — and /auth/2fa/generate and /verify
  // are both behind `requireUser`, so a bearer token is exactly what they want.
  const generate = await http.post('/auth/2fa/generate', {}, auth(user.token));
  expectStatus(generate, 200, `2fa generate for ${user.email}`);

  const secret: string = generate.data.data.secret;
  if (!secret) {
    throw new Error(`[e2e] 2fa/generate returned no secret: ${JSON.stringify(generate.data)}`);
  }

  const verify = await http.post(
    '/auth/2fa/verify',
    { token: totpCode(secret) },
    auth(user.token),
  );
  expectStatus(verify, 200, `2fa verify for ${user.email}`);

  // Log in for real. A privileged account never gets tokens from /auth/login
  // directly: it answers 200 with { status: 'MFA_REQUIRED', challengeToken },
  // and that opaque token — not the email — is what identifies the pending
  // session to /auth/2fa/authenticate.
  const login = await http.post('/auth/login', { email: user.email, password: user.password });
  expectStatus(login, 200, `login ${user.email}`);

  if (login.data.status !== 'MFA_REQUIRED' || !login.data.challengeToken) {
    throw new Error(
      `[e2e] expected an MFA challenge for ${user.email}, got: ${JSON.stringify(login.data)}`,
    );
  }

  const challenge = await http.post('/auth/2fa/authenticate', {
    challengeToken: login.data.challengeToken,
    token: totpCode(secret),
  });
  expectStatus(challenge, 200, `2fa authenticate for ${user.email}`);

  // This branch wraps: `res.json({ success: true, data: auth })`.
  const token: string = challenge.data.data.accessToken;
  if (!token) {
    throw new Error(`[e2e] no access token after MFA for ${user.email}`);
  }

  return { ...user, token, totpSecret: secret };
}

/** Register an account and elevate it to admin (DB — there is no API). */
export async function seedAdmin(): Promise<TestUser> {
  const admin = await registerUser('admin');
  promoteToAdmin(admin.email);
  return enrolMfaAndLogin(admin);
}

/** Register a seller, get them verified by the admin, and re-auth as seller. */
export async function seedSeller(admin: TestUser): Promise<TestUser> {
  const seller = await registerUser('seller');

  const apply = await http.post(
    '/sellers/register',
    {
      businessName: `E2E Traders ${randomUUID().slice(0, 6)}`,
      businessType: 'company',
      businessEmail: seller.email,
      businessPhone: '+256770000001',
      businessAddress: { street: 'Plot 1', city: 'Kampala', country: 'UG' },
      bankAccount: { accountNumber: '0000000000', bankName: 'Stanbic', accountName: 'E2E Traders' },
    },
    auth(seller.token),
  );
  expectStatus(apply, 201, 'seller application');

  const sellerProfileId: string = apply.data.seller.id;
  if (!sellerProfileId) {
    throw new Error(`[e2e] seller application returned no profile id: ${JSON.stringify(apply.data)}`);
  }

  const verify = await http.put(
    `/admin/sellers/${sellerProfileId}/verify`,
    { action: 'approve' },
    auth(admin.token),
  );
  expectStatus(verify, 200, 'admin approves seller');

  // ROLE_SELLER is now on the account, which puts it behind MFA and
  // invalidates the role claims in the token issued at signup.
  return enrolMfaAndLogin(seller);
}

export interface SeededProduct {
  productId: string;
  variantId: string;
  sellerId: string;
  unitPrice: number;
}

/** Create a product + variant, get it moderated ACTIVE, and stock it. */
export async function seedProduct(
  seller: TestUser,
  admin: TestUser,
  unitPrice: number,
  stock: number,
): Promise<SeededProduct> {
  const slug = `e2e-widget-${randomUUID().slice(0, 8)}`;

  const created = await http.post(
    '/seller/products',
    {
      name: 'E2E Test Widget',
      slug,
      description: 'Created by the end-to-end checkout suite.',
      basePrice: unitPrice,
      currency: 'UGX',
      status: 'PENDING_APPROVAL',
    },
    auth(seller.token),
  );
  expectStatus(created, 201, 'seller creates product');

  const productId: string = created.data.data.id;
  if (!productId) {
    throw new Error(`[e2e] product create returned no id: ${JSON.stringify(created.data)}`);
  }

  // NOT /seller/products/:id/variants — product-service registers variant
  // creation under /api/v1/products/:id/variants only, and the gateway
  // forwards originalUrl verbatim, so the seller-namespaced path 404s.
  //
  // This call succeeds because `seller` owns the product. createVariant now
  // checks that: it used to assert only that `x-user-id` was present, and the
  // gateway mounts /products with `pub()`, so any signed-in customer could add
  // a variant at any price to anyone's listing. The ownership case is covered
  // by the auth-boundary test in checkout.flow.test.ts.
  const variant = await http.post(
    `/products/${productId}/variants`,
    {
      attributes: { size: 'standard' },
      price: unitPrice,
      stock,
      lowStockThreshold: 1,
    },
    auth(seller.token),
  );
  expectStatus(variant, 201, 'seller creates variant');

  const variantId: string = variant.data.data.id;
  if (!variantId) {
    throw new Error(`[e2e] variant create returned no id: ${JSON.stringify(variant.data)}`);
  }

  // Without this the product stays PENDING_APPROVAL and pricing refuses it.
  const moderate = await http.patch(
    `/admin/products/${productId}/moderate`,
    { action: 'approve' },
    auth(admin.token),
  );
  expectStatus(moderate, 200, 'admin approves product');

  // Set stock through the database so the starting quantity is exact
  // regardless of what earlier runs left behind.
  setVariantStock(variantId, stock);

  return { productId, variantId, sellerId: seller.userId, unitPrice };
}
