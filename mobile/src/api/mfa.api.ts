import { apiClient, type ApiEnvelope } from './client';

// ─── Two-factor enrolment ─────────────────────────────────────────────────────
//
// The leg between "this account must have 2FA" and "this account has 2FA".
// login() answers MFA_ENROLLMENT_REQUIRED with an `enrollmentToken` for
// privileged accounts — ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_SELLER — that have
// no second factor yet. Mobile could route to that branch but had nothing to
// route to, so those accounts could not sign in on a phone at all.
//
// Three properties of the enrolment token decide how this module is written:
//
//   • It is read from the request BODY, never the Authorization header.
//     auth-service's requireEnrolmentActor destructures `{ enrollmentToken }`
//     off req.body; no other handler reads that field, so the credential
//     cannot be replayed against an unrelated protected endpoint. Sending it
//     as a Bearer token would not work and would widen its reach.
//
//   • It is not a session. It carries no roles and lives five minutes, so it
//     is passed through the screen that uses it and never written to
//     SecureStore beside the real access/refresh pair.
//
//   • Completing enrolment grants nothing. verify returns no tokens by design
//     (see totp.controller.ts), which is what stops enrolment being a way to
//     mint a session. The caller signs in again and passes the normal
//     MFA_REQUIRED challenge — handled by the existing two-factor screen.

/** What auth-service returns to put into an authenticator app. */
export interface EnrolmentSetup {
  /** The shared secret, for manual entry. Sensitive — never log it. */
  secret: string;
  /** otpauth:// URI the authenticator app understands directly. */
  otpauthUrl: string;
  qrCodeInstructions: string;
}

export const mfaApi = {
  /**
   * Start enrolment: mints (or re-reads) the account's TOTP secret.
   *
   * 409 when 2FA is already enabled — auth-service refuses to silently replace
   * a working authenticator, so re-enrolment has to go through an explicit
   * disable step.
   */
  beginEnrolment: async (enrollmentToken: string): Promise<EnrolmentSetup> => {
    const { data } = await apiClient.post<ApiEnvelope<EnrolmentSetup>>(
      '/api/v1/auth/2fa/generate',
      { enrollmentToken },
    );
    return data.data;
  },

  /**
   * Finish enrolment with a code from the authenticator.
   *
   * Returns nothing on purpose. The response body is `{ success, message }`
   * with no `data` and no tokens, so there is deliberately nothing here to
   * hand to establishSessionThunk.
   */
  completeEnrolment: async (enrollmentToken: string, token: string): Promise<void> => {
    await apiClient.post('/api/v1/auth/2fa/verify', { enrollmentToken, token });
  },
};
