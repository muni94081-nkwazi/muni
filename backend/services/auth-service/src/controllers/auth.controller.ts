import type { NextFunction, Request, Response } from 'express';
import * as auth from '../services/auth.service.js';
import { loginSchema, registerSchema } from '../../../../shared/validators/common.js';
import { validatePasswordPolicy } from '../../../../shared/security/password.js';
import { AuditLogger, toActorRole } from '../../../../shared/security/audit.js';
import { refreshCookieOptions, REFRESH_COOKIE_MAX_AGE_MS } from '../security/cookie.js';

// ─── Response contract for the session endpoints ──────────────────────────────
//
// Every endpoint that issues, refreshes or exchanges a session answers with
//
//     { success: true, data: <payload> }
//
// That covers, across this file and oauth.controller / totp.controller:
//
//     POST /api/v1/auth/register
//     POST /api/v1/auth/login              (all three outcomes, inside `data`)
//     POST /api/v1/auth/refresh
//     POST /api/v1/auth/exchange
//     POST /api/v1/auth/2fa/authenticate
//
// Three of those used to answer bare and two enveloped, with no rule saying
// which was which. Clients had to hardcode the difference per endpoint, and
// mobile got it wrong in both directions at once: src/api/auth.api.ts carries
// the scar tissue, having unwrapped `.data` on the bare ones — which yielded
// `undefined` and broke login, registration and token refresh simultaneously —
// while reading the enveloped one bare.
//
// `success` is redundant next to the HTTP status and is here only because
// 2fa/authenticate already sent it and the clients already read it; changing
// the shape of the endpoint that worked, to match three that did not, would
// have been the more disruptive direction.
//
// DELIBERATELY NOT CHANGED, and still inconsistent:
//   GET /users/me, GET /auth/providers      — bare
//   admin.controller, seller.controller     — mixed, both shapes in one file
//   gdpr.controller                         — enveloped
// Those are read by admin-panel and seller-center, which between them have two
// tests, so folding them in here would be a broad change with nothing to catch
// a miss. Worth doing; worth doing separately.
//
// LOGOUT is exempt: it answers 204 with no body at all.

// ─── Where a refresh token may arrive from ────────────────────────────────────
//
// Three carriers, in order of trustworthiness:
//
//   1. the httpOnly `refreshToken` cookie — the web apps' normal path, and the
//      only one a page's own JavaScript cannot read;
//   2. the request body — how the native app sends it, having no cookie jar
//      shared with the browser;
//   3. an `Authorization: Bearer` header, for direct service calls in dev.
//
// The body is read under BOTH spellings deliberately. This endpoint has always
// documented `refresh_token`, but every client in this repository sends
// `refreshToken`: customer-web in api/axios.config.ts and mobile in
// api/client.ts. Web password logins kept working anyway because the
// same-origin cookie arrives regardless of the body — which is exactly what
// hid the mismatch. Mobile has no cookie, so it could never refresh at all and
// ended every session at the 15-minute access-token expiry.
//
// Accepting both is the fix that breaks neither contract. Do not narrow this to
// one spelling without changing both clients in the same commit.
function readRefreshTokenFromRequest(req: Request): string | undefined {
  const body = req.body as { refresh_token?: string; refreshToken?: string } | undefined;
  return (
    (req.cookies as Record<string, string> | undefined)?.refreshToken ??
    body?.refresh_token ??
    body?.refreshToken ??
    req.header('authorization')?.replace(/^Bearer\s+/i, '')
  );
}

// ─── Register ─────────────────────────────────────────────────────────────────
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = registerSchema.parse(req.body);

    // Enforce 12+ char strong password policy
    const policyResult = validatePasswordPolicy(input.password);
    if (!policyResult.isValid) {
      res.status(422).json({
        message: 'Password does not meet enterprise complexity policy',
        issues: policyResult.errors,
      });
      return;
    }

    const result = await auth.register(input);

    AuditLogger.logAction({
      actorId: result.user.id,
      actorRole: 'customer',
      action: 'auth.register',
      resource: 'User',
      resourceId: result.user.id,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await auth.login(input);

    // ── Second factor still outstanding ────────────────────────────────────
    // No cookie and no tokens here: the challenge/enrolment token carries no
    // roles and is useless except at the endpoint it names.
    if (result.status === 'MFA_REQUIRED') {
      AuditLogger.logAction({
        actorId: 'unknown', actorRole: 'customer',
        action: 'auth.mfa_challenge_issued',
        resource: 'UserSession', resourceId: 'pending',
        ipAddress: req.ip,
      });
      res.status(200).json({
        success: true,
        data: {
          status: 'MFA_REQUIRED',
          challengeToken: result.challengeToken,
          message: 'Enter the 6-digit code from your authenticator app.',
        },
      });
      return;
    }

    if (result.status === 'MFA_ENROLLMENT_REQUIRED') {
      res.status(200).json({
        success: true,
        data: {
          status: 'MFA_ENROLLMENT_REQUIRED',
          enrollmentToken: result.enrollmentToken,
          message: 'This account requires two-factor authentication. Set it up to continue.',
        },
      });
      return;
    }

    // ── Fully authenticated ────────────────────────────────────────────────
    // Cookie lifetime now matches the refresh token's own 30-day expiry; the
    // previous 7-day cookie silently logged users out three weeks early.
    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions(REFRESH_COOKIE_MAX_AGE_MS));

    AuditLogger.logAction({
      actorId: result.user.id,
      actorRole: toActorRole(result.user.roles[0]),
      action: 'auth.login_success',
      resource: 'UserSession',
      resourceId: result.user.id,
      ipAddress: req.ip,
    });

    // `result` already carries `status: 'AUTHENTICATED'`, so all three login
    // outcomes come back under one discriminated shape inside `data`.
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawToken = readRefreshTokenFromRequest(req);

    const result = await auth.refresh(rawToken);

    // Rotate refresh token cookie. Same 30-day lifetime as the one issued at
    // login — the previous 7-day value here quietly shortened the session on
    // every rotation, expiring it three weeks before the token itself.
    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions(REFRESH_COOKIE_MAX_AGE_MS));

    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawToken = readRefreshTokenFromRequest(req);

    await auth.logout(rawToken);
    res.clearCookie('refreshToken');
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await auth.forgotPassword((req.body as { email?: string }).email ?? '');
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

// ─── Reset Password ───────────────────────────────────────────────────────────
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, otp, newPassword } = req.body as {
      email?: string;
      otp?: string;
      newPassword?: string;
    };
    if (!email || !otp || !newPassword) {
      res.status(400).json({ message: 'email, otp, and newPassword are required' });
      return;
    }

    const policyResult = validatePasswordPolicy(newPassword);
    if (!policyResult.isValid) {
      res.status(422).json({
        message: 'Password does not meet enterprise complexity policy',
        issues: policyResult.errors,
      });
      return;
    }

    await auth.resetPassword(email, otp, newPassword);
    res.clearCookie('refreshToken');

    AuditLogger.logAction({
      actorId: email,
      actorRole: 'customer',
      action: 'auth.reset_password',
      resource: 'User',
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

// ─── Change Password ──────────────────────────────────────────────────────────
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = res.locals.userId as string;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'currentPassword and newPassword are required' });
      return;
    }

    const policyResult = validatePasswordPolicy(newPassword);
    if (!policyResult.isValid) {
      res.status(422).json({
        message: 'Password does not meet enterprise complexity policy',
        issues: policyResult.errors,
      });
      return;
    }

    await auth.changePassword(userId, currentPassword, newPassword);
    res.clearCookie('refreshToken');

    AuditLogger.logAction({
      actorId: userId,
      actorRole: 'customer',
      action: 'auth.change_password',
      resource: 'User',
      resourceId: userId,
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
}
