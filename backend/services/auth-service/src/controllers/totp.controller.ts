import type { NextFunction, Request, Response } from 'express';
import { TOTPService } from '../../../../shared/security/totp.js';
import { AuditLogger, toActorRole, type ActorRole } from '../../../../shared/security/audit.js';
import { readMfaChallengeToken } from '../../../../shared/utils/token.js';
import { twoFactorRepository } from '../repositories/twofactor.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { buildAuthResponse } from '../services/auth.service.js';
import { refreshCookieOptions, REFRESH_COOKIE_MAX_AGE_MS } from '../security/cookie.js';
import {
  burnCode,
  clearAttempts,
  countFailedAttempt,
  isLockedOut,
  MFA_MAX_ATTEMPTS,
} from '../security/mfa-attempt.store.js';

// ─── 2FA (TOTP) Controller ────────────────────────────────────────────────────
//
// Enrolment (generate → verify) accepts either an authenticated session or the
// short-lived `enrol` challenge token login() mints when it refuses to issue a
// session until 2FA is set up. Login verification (authenticate) takes the
// separate `verify` challenge — the caller has only a password at that point.
//
// In every case the subject comes from a signed token or a gateway-stamped
// session, never from a user id supplied in the request body.
//
// The distinction matters: a body-supplied userId let anyone name any account,
// which turned the endpoint into an oracle for "does this account have 2FA?"
// and, combined with unauthenticated /generate, into a way to overwrite a
// victim's secret with one the attacker controls.

/**
 * Resolve the authenticated actor. Returns null and writes a 401 when the
 * gateway did not stamp an identity — there is deliberately no default user.
 */
function requireActor(req: Request, res: Response): string | null {
  const userId = (req.headers['x-user-id'] as string | undefined) ?? (res.locals.userId as string | undefined);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return null;
  }
  return userId;
}

/**
 * Resolve the actor for ENROLMENT, which has two legitimate callers.
 *
 * 1. A signed-in user turning 2FA on voluntarily — the original case, still
 *    resolved from the gateway-stamped session exactly as before.
 *
 * 2. Someone the server has just told it *must* enrol before it will issue a
 *    session at all. login() returns MFA_ENROLLMENT_REQUIRED plus an
 *    `enrollmentToken` for that case — but nothing read that token, and these
 *    routes demanded an access token the caller cannot obtain until enrolment
 *    is done. Mandatory enrolment was therefore impossible to complete: a
 *    newly-approved seller could never reach the Seller Center.
 *
 * The enrolment credential is read from the request BODY, the same way
 * authenticate2FA reads its challenge token, and never from the Authorization
 * header. That is deliberate: a token that is only ever consumed by a handler
 * explicitly looking for it cannot be replayed against an unrelated protected
 * endpoint, because no other handler reads that field. readMfaChallengeToken
 * pins the signature, issuer, audience, 5-minute expiry, the `mfa_challenge`
 * type and — critically — the `enrol` purpose, so a `verify` challenge minted
 * for the second leg of login cannot be used to enrol, or vice versa.
 *
 * The token carries no roles, so completing enrolment grants nothing. It names
 * its subject, so it can only enrol the account it was issued for. And it does
 * not become a session: verify2FASecret still returns no tokens, leaving the
 * caller to log in again and pass the normal MFA challenge.
 *
 * A supplied-but-invalid token is refused rather than falling through to the
 * session path, so a bad credential can never be masked by an ambient session.
 */
function requireEnrolmentActor(req: Request, res: Response): string | null {
  const { enrollmentToken } = req.body as { enrollmentToken?: string };

  if (enrollmentToken !== undefined) {
    const claim = readMfaChallengeToken(enrollmentToken, 'enrol');
    if (!claim) {
      res.status(401).json({ success: false, message: 'Invalid or expired enrollment token' });
      return null;
    }
    return claim.sub;
  }

  return requireActor(req, res);
}

/** Roles are needed for the audit trail; fall back to a neutral label. */
function actorRole(req: Request): ActorRole {
  const roles = (req.headers['x-user-roles'] as string | undefined)?.split(',') ?? [];
  return toActorRole(roles[0]);
}

// ─── POST /api/v1/auth/2fa/generate ───────────────────────────────────────────

export async function generate2FASecret(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireEnrolmentActor(req, res);
    if (!userId) return;

    const user = await userRepository.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Refuse to silently replace a working authenticator. Re-enrolment must go
    // through an explicit disable step so a stolen session cannot quietly swap
    // the second factor for one the attacker holds.
    const existing = await twoFactorRepository.find(userId);
    if (existing?.enabled) {
      res.status(409).json({
        success: false,
        message: 'Two-factor authentication is already enabled. Disable it before enrolling a new device.',
      });
      return;
    }

    // Email comes from the user record, not the request body — otherwise the
    // otpauth label can be spoofed to make the entry look like another account.
    const result = TOTPService.generateSecret(user.email);
    await twoFactorRepository.upsertSecret(userId, result.secret);

    AuditLogger.logAction({
      actorId: userId,
      actorRole: actorRole(req),
      action: '2fa.generate_secret',
      resource: 'User2FA',
      resourceId: userId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        secret: result.secret,
        otpauthUrl: result.otpauthUrl,
        qrCodeInstructions: 'Scan otpauthUrl with Google Authenticator or Authy',
      },
    });
  } catch (e) {
    next(e);
  }
}

// ─── POST /api/v1/auth/2fa/verify ─────────────────────────────────────────────

export async function verify2FASecret(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireEnrolmentActor(req, res);
    if (!userId) return;

    const { token } = req.body as { token?: string };

    // Only the stored secret counts. Accepting a client-supplied `secret` here
    // meant an attacker could verify against their own secret and have the
    // server persist it as the account's second factor.
    const stored = await twoFactorRepository.find(userId);
    if (!stored) {
      res.status(400).json({ success: false, message: 'No 2FA secret found. Generate 2FA secret first.' });
      return;
    }

    if (await isLockedOut(userId)) {
      res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
      return;
    }

    if (!token || !TOTPService.verifyToken(stored.secret, token)) {
      const { attempts } = await countFailedAttempt(userId);
      res.status(400).json({
        success: false,
        message: 'Invalid 2FA verification token',
        attemptsRemaining: Math.max(0, MFA_MAX_ATTEMPTS - attempts),
      });
      return;
    }

    await twoFactorRepository.markEnabled(userId);
    await clearAttempts(userId);

    AuditLogger.logAction({
      actorId: userId,
      actorRole: actorRole(req),
      action: '2fa.enable',
      resource: 'User2FA',
      resourceId: userId,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: '2FA authentication successfully enabled' });
  } catch (e) {
    next(e);
  }
}

// ─── POST /api/v1/auth/2fa/authenticate ───────────────────────────────────────
//
// Second leg of login. Exchanges (challengeToken + 6-digit code) for a real
// token pair. The challenge token names the subject, so no userId is accepted
// from the caller.

export async function authenticate2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { challengeToken, token } = req.body as { challengeToken?: string; token?: string };

    if (!challengeToken || !token) {
      res.status(400).json({ success: false, message: 'challengeToken and token are required' });
      return;
    }

    const claim = readMfaChallengeToken(challengeToken, 'verify');
    if (!claim) {
      res.status(401).json({ success: false, message: 'Challenge expired or invalid — please sign in again' });
      return;
    }

    if (await isLockedOut(claim.sub)) {
      res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
      return;
    }

    const stored = await twoFactorRepository.find(claim.sub);
    if (!stored?.enabled) {
      res.status(400).json({ success: false, message: '2FA is not enabled for this account' });
      return;
    }

    if (!TOTPService.verifyToken(stored.secret, token)) {
      const { attempts } = await countFailedAttempt(claim.sub);
      res.status(401).json({
        success: false,
        message: 'Invalid 2FA authentication code',
        attemptsRemaining: Math.max(0, MFA_MAX_ATTEMPTS - attempts),
      });
      return;
    }

    // Valid code — burn it so the same six digits cannot be replayed during
    // the remainder of their window.
    if (!(await burnCode(claim.sub, token))) {
      res.status(401).json({ success: false, message: 'This code has already been used' });
      return;
    }

    const user = await userRepository.findById(claim.sub);
    if (!user || !user.active) {
      res.status(401).json({ success: false, message: 'Account is unavailable' });
      return;
    }

    await clearAttempts(claim.sub);
    await userRepository.update(user.id, { lastLoginAt: new Date() });

    AuditLogger.logAction({
      actorId: user.id,
      actorRole: toActorRole(user.roles[0]),
      action: '2fa.login_success',
      resource: 'UserSession',
      resourceId: user.id,
      ipAddress: req.ip,
    });

    const auth = await buildAuthResponse(user);

    // Shares refreshCookieOptions with the non-MFA login path, which matters
    // most here: ROLE_ADMIN, ROLE_SUPER_ADMIN and ROLE_SELLER are all in
    // MFA_REQUIRED_ROLES, so this is the only branch that ever issues their
    // cookie. It previously scoped it to path=/api/v1/auth, which meant the
    // cookie was not sent to any other path, res.clearCookie() (path=/) could
    // not remove it on logout, and a second same-named cookie could shadow it.
    res.cookie('refreshToken', auth.refreshToken, refreshCookieOptions(REFRESH_COOKIE_MAX_AGE_MS));

    res.json({ success: true, data: auth });
  } catch (e) {
    next(e);
  }
}
