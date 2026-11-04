import bcrypt from 'bcryptjs';
import { randomUUID, randomInt }  from 'node:crypto';
import { sendNotification } from '../clients/notification.client.js';
import {
  createAccessToken,
  createRefreshToken,
  createMfaChallengeToken,
  readRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../../../../shared/utils/token.js';
import { userRepository }  from '../repositories/user.repository.js';
import { twoFactorRepository } from '../repositories/twofactor.repository.js';
import {
  clearResetAttempts,
  countFailedResetAttempt,
  isResetLockedOut,
} from '../security/mfa-attempt.store.js';
import { requiresSecondFactor } from '../security/mfa-policy.js';
import type { IUserRepository, UserRecord } from '../repositories/user.repository.js';

// Roles that must carry a second factor now live in ../security/mfa-policy.js,
// so the OAuth callback enforces the same list this path does.


// ─── Config ───────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

// ─── Public User Shape (no passwordHash) ─────────────────────────────────────
export interface PublicUser {
  id:                string;
  firstName:         string;
  lastName:          string;
  fullName:          string;
  email:             string;
  phoneNumber:       string | null;
  profilePictureUrl: string | null;
  active:            boolean;
  emailVerified:     boolean;
  phoneVerified:     boolean;
  roles:             string[];
  lastLoginAt:       string | null;
  createdAt:         string;
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id:                user.id,
    firstName:         user.firstName,
    lastName:          user.lastName,
    fullName:          `${user.firstName} ${user.lastName}`,
    email:             user.email,
    phoneNumber:       user.phoneNumber ?? null,
    profilePictureUrl: user.profilePictureUrl ?? null,
    active:            user.active,
    emailVerified:     user.emailVerified,
    phoneVerified:     user.phoneVerified,
    roles:             user.roles,
    lastLoginAt:       user.lastLoginAt?.toISOString() ?? null,
    createdAt:         user.createdAt.toISOString(),
  };
}

// ─── Auth Response ────────────────────────────────────────────────────────────
interface AuthResponse {
  accessToken:  string;
  refreshToken: string;
  tokenType:    'Bearer';
  expiresIn:    number;   // seconds
  user:         PublicUser;
}

/**
 * @param continueFamily
 *   The family this token belongs to. Omitted for a NEW session (login,
 *   register, 2FA completion, social sign-in), which starts its own family;
 *   passed by `refresh` to keep a rotated token in the family it replaced.
 *
 *   That distinction is load-bearing, and getting it wrong silently disables
 *   theft detection. `refresh` used to omit it, so every rotation minted a
 *   fresh family — which meant a replayed token was only ever compared against
 *   a family containing itself. Reuse was still *reported*, but the revocation
 *   swept an already-dead family while the live session the thief had just
 *   rotated into carried on working. The one thing the mechanism exists to do,
 *   it did not do.
 */
export async function buildAuthResponse(
  user: UserRecord,
  repo: IUserRepository = userRepository,
  continueFamily?: string,
): Promise<AuthResponse> {
  const family       = continueFamily ?? randomUUID();
  const rawRefresh   = createRefreshToken(user.id, family);
  const refreshHash  = await bcrypt.hash(rawRefresh, 10);
  const expiresAt    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Clean up expired tokens for this user before creating a new one
  await repo.deleteExpiredRefreshTokens(user.id);

  await repo.createRefreshToken({
    userId:    user.id,
    tokenHash: refreshHash,
    family,
    expiresAt,
  });

  return {
    accessToken:  createAccessToken(user.id, user.roles),
    refreshToken: rawRefresh,
    tokenType:    'Bearer',
    // Derived from JWT_ACCESS_EXPIRES_IN rather than the hardcoded 3600 that
    // was here: the token actually lives 15 minutes by default, so any client
    // refreshing on this number was 45 minutes late.
    expiresIn:    ACCESS_TOKEN_TTL_SECONDS,
    user:         toPublicUser(user),
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────
export async function register(
  input: {
    firstName:    string;
    lastName:     string;
    email:        string;
    password:     string;
    phoneNumber?: string;
  },
  repo: IUserRepository = userRepository,
): Promise<AuthResponse> {
  const existing = await repo.findByEmail(input.email);
  if (existing) {
    throw Object.assign(new Error('Email is already registered'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await repo.create({
    firstName:    input.firstName,
    lastName:     input.lastName,
    email:        input.email,
    phoneNumber:  input.phoneNumber,
    passwordHash,
  });

  return buildAuthResponse(user, repo);
}

// ─── Login ────────────────────────────────────────────────────────────────────
//
// Returns one of three shapes. Callers must branch on `status`:
//
//   AuthResponse                  — password only, no second factor configured
//   { status: 'MFA_REQUIRED' }    — correct password, awaiting a TOTP code
//   { status: 'MFA_ENROLLMENT_REQUIRED' }
//                                 — privileged account with no second factor;
//                                   must enrol before it can obtain tokens
//
// The challenge token carries no roles, so on its own it authorizes nothing.

export type LoginResult =
  | ({ status: 'AUTHENTICATED' } & AuthResponse)
  | { status: 'MFA_REQUIRED';            challengeToken: string }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; enrollmentToken: string };

export async function login(
  input: { email: string; password: string },
  repo: IUserRepository = userRepository,
): Promise<LoginResult> {
  const user = await repo.findByEmail(input.email);
  // Always run bcrypt.compare even on miss to prevent timing-based email enumeration
  const passwordOk = user
    ? await bcrypt.compare(input.password, user.passwordHash)
    : (await bcrypt.hash('dummy', 4), false); // burn CPU to equalise timing

  if (!user || !passwordOk) {
    throw Object.assign(new Error('Invalid email or password'), { status: 401 });
  }

  if (!user.active) {
    throw Object.assign(new Error('Account is deactivated'), { status: 403 });
  }

  const twoFactor    = await twoFactorRepository.find(user.id).catch(() => null);
  const isPrivileged = requiresSecondFactor(user.roles);

  // No grandfathering: an existing admin without 2FA is redirected into
  // enrolment rather than issued tokens. Anything softer means the accounts
  // that most need a second factor are exactly the ones that never get one.
  if (isPrivileged && !twoFactor?.enabled) {
    return {
      status:          'MFA_ENROLLMENT_REQUIRED',
      enrollmentToken: createMfaChallengeToken(user.id, 'enrol'),
    };
  }

  if (twoFactor?.enabled) {
    return {
      status:         'MFA_REQUIRED',
      challengeToken: createMfaChallengeToken(user.id, 'verify'),
    };
  }

  await repo.update(user.id, { lastLoginAt: new Date() });

  return { status: 'AUTHENTICATED', ...(await buildAuthResponse(user, repo)) };
}

// ─── Refresh Token Rotation ───────────────────────────────────────────────────
export async function refresh(
  rawToken: string | undefined,
  repo: IUserRepository = userRepository,
): Promise<AuthResponse> {
  if (!rawToken) {
    throw Object.assign(new Error('Refresh token required'), { status: 401 });
  }

  const payload = readRefreshToken(rawToken);
  if (!payload) {
    throw Object.assign(new Error('Invalid or expired refresh token'), { status: 401 });
  }

  // Find the matching token record by scanning the family
  // (we can't hash-lookup raw tokens directly — we hash them on storage)
  const familyTokens = await repo.findRefreshTokensByFamily(payload.family);
  let matched: Awaited<ReturnType<typeof repo.findRefreshTokensByFamily>>[0] | null = null;
  for (const record of familyTokens) {
    if (!record.revokedAt && record.expiresAt > new Date()) {
      const ok = await bcrypt.compare(rawToken, record.tokenHash);
      if (ok) { matched = record; break; }
    }
  }

  if (!matched) {
    // A token from this family was re-used — revoke the entire family (theft detection)
    if (familyTokens.length > 0) {
      for (const t of familyTokens) await repo.revokeRefreshToken(t.id);
    }
    throw Object.assign(new Error('Refresh token reuse detected — please log in again'), { status: 401 });
  }

  // Rotate: revoke the old token and issue a new one
  await repo.revokeRefreshToken(matched.id);

  const user = await repo.findById(payload.sub);
  if (!user || !user.active) {
    throw Object.assign(new Error('User not found or deactivated'), { status: 401 });
  }

  // Same family, deliberately. The replacement has to stay in the chain the
  // token it replaced belonged to, or the reuse check above has nothing to find.
  return buildAuthResponse(user, repo, payload.family);
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logout(
  rawToken: string | undefined,
  repo: IUserRepository = userRepository,
): Promise<void> {
  if (!rawToken) return;
  const payload = readRefreshToken(rawToken);
  if (!payload) return;

  // Revoke every token in this family (covers all sessions if user wishes)
  const familyTokens = await repo.findRefreshTokensByFamily(payload.family);
  for (const t of familyTokens) {
    if (!t.revokedAt) await repo.revokeRefreshToken(t.id);
  }
}

// ─── Current User ─────────────────────────────────────────────────────────────
export async function currentUser(
  id: string,
  repo: IUserRepository = userRepository,
): Promise<PublicUser> {
  const user = await repo.findById(id);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  return toPublicUser(user);
}

// ─── Update User ──────────────────────────────────────────────────────────────
export async function updateUser(
  id: string,
  input: Partial<Pick<PublicUser, 'firstName' | 'lastName' | 'phoneNumber' | 'profilePictureUrl'>>,
  repo: IUserRepository = userRepository,
): Promise<PublicUser> {
  const user = await repo.findById(id);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  // Strip null → undefined so it satisfies UpdateUserInput (string | undefined)
  const sanitised: Parameters<typeof repo.update>[1] = {
    firstName:         input.firstName ?? undefined,
    lastName:          input.lastName ?? undefined,
    phoneNumber:       input.phoneNumber ?? undefined,
    profilePictureUrl: input.profilePictureUrl ?? undefined,
  };
  const updated = await repo.update(id, sanitised);
  return toPublicUser(updated);
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
export async function forgotPassword(
  email: string,
  repo: IUserRepository = userRepository,
): Promise<void> {
  const user = await repo.findByEmail(email);
  if (!user) return; // silent — never reveal whether email exists

  // randomInt, not Math.random: this is a credential. Math.random is a
  // predictable PRNG, so an attacker who can observe a few codes can narrow the
  // next one — and six digits is a small enough space already.
  const otp = randomInt(100_000, 1_000_000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await repo.createPasswordReset({ userId: user.id, otpHash, expiresAt });

  // Delivered by notification-service, which owns the channels (email/SMS) and
  // the copy — `user.password_reset_requested` is already registered in its
  // template list, so the wording is not duplicated here.
  //
  // Deliberately awaited but never allowed to throw. This function must behave
  // identically for a known and an unknown address, so a notifier outage cannot
  // become a 500 that tells an attacker the account exists.
  const delivered = await sendNotification({
    userId: user.id,
    type: 'user.password_reset_requested',
    data: { resetToken: otp },
    // Two taps in a row should not race two different codes to the same inbox.
    dedupeKey: `pwreset:${user.id}:${Math.floor(Date.now() / 60_000)}`,
  });

  if (!delivered) {
    // The row is already written, so the code is valid — it just has not
    // reached anyone. Say so plainly; the previous behaviour logged the OTP
    // unconditionally and called that "sending it".
    console.error(
      `[auth-service] Password reset OTP for user ${user.id} could not be delivered. ` +
      `The reset row is valid until ${expiresAt.toISOString()}.`,
    );

    // Outside production only, print the code so local development without a
    // configured notification provider is still usable. Never in production:
    // that would put a live credential in the log stream.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[auth-service][dev] Password reset OTP for ${email}: ${otp}`);
    }
  }
}

// ─── Reset Password ───────────────────────────────────────────────────────────
export async function resetPassword(
  email:       string,
  otp:         string,
  newPassword: string,
  repo: IUserRepository = userRepository,
): Promise<void> {
  const user = await repo.findByEmail(email);
  if (!user) throw Object.assign(new Error('Invalid or expired OTP'), { status: 400 });

  // Six digits is a 10^6 space and the row stays valid for 15 minutes, so the
  // only thing standing between an attacker and a stranger's account is how
  // many guesses they get. The gateway's per-IP limit bounds one source; this
  // bounds the account, which is what a distributed guesser defeats.
  //
  // Checked before the OTP comparison, so a locked account costs no bcrypt.
  if (await isResetLockedOut(user.id)) {
    throw Object.assign(
      new Error('Too many reset attempts. Request a new code and try again later.'),
      { status: 429 },
    );
  }

  const reset = await repo.findLatestPasswordReset(user.id);
  if (!reset || reset.expiresAt < new Date()) {
    // Counted too: without this, an attacker whose guesses all land after the
    // row expired walks away with the counter untouched, and can start again
    // the moment the victim requests a fresh code.
    await countFailedResetAttempt(user.id);
    throw Object.assign(new Error('Invalid or expired OTP'), { status: 400 });
  }

  const otpValid = await bcrypt.compare(otp, reset.otpHash);
  if (!otpValid) {
    await countFailedResetAttempt(user.id);
    throw Object.assign(new Error('Invalid or expired OTP'), { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await repo.update(user.id, { active: true }); // ensure account not locked
  // Use raw Prisma here to update passwordHash (not exposed on UpdateUserInput)
  // We call via the repository's underlying prisma instance via casting
  await import('../db/prisma.js').then(({ prisma }) =>
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
  );

  await repo.markPasswordResetUsed(reset.id);
  await clearResetAttempts(user.id);

  // Revoke all sessions after a password reset (security best practice)
  await repo.revokeAllUserTokens(user.id);
}

// ─── Change Password ──────────────────────────────────────────────────────────
export async function changePassword(
  userId:      string,
  currentPassword: string,
  newPassword: string,
  repo: IUserRepository = userRepository,
): Promise<void> {
  const user = await repo.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await import('../db/prisma.js').then(({ prisma }) =>
    prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } }),
  );

  // Revoke all other sessions
  await repo.revokeAllUserTokens(userId);
}

// ─── List Users (admin) ───────────────────────────────────────────────────────

/**
 * Hard ceiling on rows per request. `?limit=` arrives straight from the query
 * string, so without this `?limit=999999` is a single-request dump of the whole
 * user table — every email, phone number and role — and a matching spike in
 * memory and query time. 100 is what the admin panel's largest page asks for.
 */
export const MAX_USER_PAGE_SIZE = 100;

export async function listUsers(
  opts: { page: number; limit: number },
): Promise<{ users: PublicUser[]; total: number; page: number; limit: number }> {
  // Number(undefined) is NaN and Number('-5') is negative; both would make
  // `skip`/`take` nonsense, so clamp rather than trust the parse.
  const limit = Math.min(
    Math.max(Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : 20, 1),
    MAX_USER_PAGE_SIZE,
  );
  const page = Math.max(Number.isFinite(opts.page) ? Math.trunc(opts.page) : 1, 1);
  const skip = (page - 1) * limit;

  const { prisma } = await import('../db/prisma.js');

  const [records, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
  ]);

  return {
    users: records.map(toPublicUser),   // toPublicUser strips passwordHash
    total,
    page,
    limit,
  };
}
