/**
 * Mirrors backend/shared/types/auth.types.ts, which is what auth-service
 * actually persists in `users.roles` and what the gateway stamps into
 * `x-user-roles`.
 *
 * This said ROLE_VENDOR, a role that appears nowhere in the backend — the
 * seller role is ROLE_SELLER, granted by admin approval. Nothing errored,
 * because the mismatch only ever produced silent falsehoods: `useAuth().isVendor`
 * could never be true, and the admin user list's "Vendors" tile always counted
 * zero while its role filter offered a value no row could match.
 */
export type UserRole = 'ROLE_CUSTOMER' | 'ROLE_SELLER' | 'ROLE_ADMIN' | 'ROLE_SUPER_ADMIN';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  profilePictureUrl: string | null;
  active: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: UserRole[];
  lastLoginAt: string | null;
  createdAt: string;
}

/** A session that actually exists: tokens plus the profile they belong to. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

/**
 * The three terminal states of POST /auth/login.
 *
 * This used to be typed as `AuthResponse` alone, which quietly asserted that
 * every 200 carries tokens. Two of them do not: auth-service answers a
 * privileged account with a challenge instead, and the login thunk — reading
 * `response.accessToken` unconditionally — wrote `undefined` into localStorage
 * and then marked the user authenticated. A seller or admin signing in on the
 * web landed in a half-session with no token and no way forward.
 *
 * Modelling it as a union is what makes forgetting a branch a compile error
 * rather than a runtime one. Mobile has always had this shape; see
 * mobile/src/api/auth.api.ts.
 */
export type LoginResult =
  | ({ status: 'AUTHENTICATED' } & AuthResponse)
  | { status: 'MFA_REQUIRED'; challengeToken: string; message?: string }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; enrollmentToken: string; message?: string };

/**
 * What POST /auth/2fa/authenticate returns, and what POST /auth/exchange
 * returns after a social login. Neither includes the profile — the caller
 * fetches it with the token it just received.
 */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  password: string;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profilePictureUrl?: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}
