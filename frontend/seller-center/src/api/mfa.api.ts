import axiosInstance from './axios.config';
import type { AuthResult } from './auth.api';

// ─── Two-factor authentication API ────────────────────────────────────────────
//
// auth-service returns one of three shapes from /auth/login:
//
//   AUTHENTICATED             a normal session
//   MFA_ENROLLMENT_REQUIRED   + enrollmentToken — the account must set up 2FA
//                             before it may hold a session at all. Sellers and
//                             admins land here the first time after approval.
//   MFA_REQUIRED              + challengeToken — 2FA is already set up; supply
//                             a code to finish signing in.
//
// Both tokens are short-lived (5 minutes), carry no roles, and are passed in
// the request BODY of exactly the endpoint that consumes them. They are never
// written to localStorage: they travel in router state for the one navigation
// that needs them, so a stale credential cannot linger in a browser profile.

export interface EnrolmentSecret {
  secret: string;
  otpauthUrl: string;
  qrCodeInstructions: string;
}

export const mfaApi = {
  /**
   * Start enrolment. Returns the secret and otpauth:// URL to put into an
   * authenticator app. Requires the `enrol` token from the login response.
   */
  beginEnrolment: async (enrollmentToken: string): Promise<EnrolmentSecret> => {
    const { data } = await axiosInstance.post('/auth/2fa/generate', { enrollmentToken });
    return data.data;
  },

  /**
   * Finish enrolment with a code from the authenticator.
   *
   * Deliberately returns no session: auth-service enables the second factor and
   * stops there, so the caller signs in again and passes the normal challenge.
   * That keeps enrolment from becoming a way to mint a session.
   */
  completeEnrolment: async (enrollmentToken: string, token: string): Promise<void> => {
    await axiosInstance.post('/auth/2fa/verify', { enrollmentToken, token });
  },

  /** Second leg of a normal login for an account that already has 2FA. */
  authenticate: async (challengeToken: string, token: string): Promise<AuthResult> => {
    const { data } = await axiosInstance.post('/auth/2fa/authenticate', { challengeToken, token });
    return data.data;
  },
};
