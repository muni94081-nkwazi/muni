import { randomUUID, createPublicKey } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import {
  createAccessToken,
  createRefreshToken,
  createMfaChallengeToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../../../../shared/utils/token.js';
import { AuditLogger, toActorRole } from '../../../../shared/security/audit.js';
import { twoFactorRepository } from '../repositories/twofactor.repository.js';
import { requiresSecondFactor } from '../security/mfa-policy.js';
import { createExchangeCode, type PendingHandshake } from '../security/oauth-state.store.js';
// Provider access/refresh tokens are live credentials for a third-party API,
// so they are encrypted at rest: a leaked database dump then yields ciphertext
// rather than tokens replayable against Google or Facebook directly.
import { encryptPII, encryptNullable } from '../../../../shared/security/security-core.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User } from '../generated/prisma/index.js';

// ─── Google OAuth2 Service ─────────────────────────────────────────────────────
//
// Flow:
//   1. GET /api/v1/auth/google       → redirect to Google consent page
//   2. Google redirects to:
//      GET /api/v1/auth/google/callback?code=...
//   3. Exchange code → access_token → fetch Google profile
//   4. Find existing OAuthAccount → link, or create new User + OAuthAccount
//   5. Issue MUNI JWT (access + refresh)
//
// Required env vars:
//   GOOGLE_CLIENT_ID       – from Google Cloud Console
//   GOOGLE_CLIENT_SECRET   – from Google Cloud Console
//   GOOGLE_CALLBACK_URL    – e.g. http://localhost:4001/api/v1/auth/google/callback
//   FRONTEND_REDIRECT_URL  – where to redirect after success (e.g. http://localhost:5174/auth/callback)

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL  ??
  'http://localhost:4001/api/v1/auth/google/callback';
const FRONTEND_REDIRECT    = process.env.FRONTEND_REDIRECT_URL ?? 'http://localhost:5174/auth/callback';

// Google OAuth2 endpoints
const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_URL  = 'https://www.googleapis.com/oauth2/v3/userinfo';

// ─── Build Consent URL ────────────────────────────────────────────────────────

export function buildGoogleAuthUrl(state?: string, codeChallenge?: string): string {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',   // get refresh_token from Google
    prompt:        'select_account',
    ...(state ? { state } : {}),
    // PKCE. Without it, an authorization code intercepted between the provider
    // and this service — a malicious app claiming our redirect scheme, a proxy
    // reading the callback URL out of a log — is redeemable on its own, because
    // the client secret is the only other thing the token endpoint asks for and
    // it is identical for every login. With it, the code is worthless without
    // the verifier, which never leaves this service.
    ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: 'S256' } : {}),
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

// ─── Google Profile Shape ─────────────────────────────────────────────────────

interface GoogleProfile {
  sub:            string;
  email:          string;
  email_verified: boolean;
  name:           string;
  given_name:     string;
  family_name:    string;
  picture:        string;
}

// ─── Exchange Code → Tokens → Profile ────────────────────────────────────────

async function exchangeCode(code: string, codeVerifier?: string): Promise<{
  accessToken:  string;
  refreshToken: string | null;
  profile:      GoogleProfile;
}> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw Object.assign(
      new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'),
      { status: 501 },
    );
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_CALLBACK_URL,
      grant_type:    'authorization_code',
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw Object.assign(new Error(`Google token exchange failed: ${err}`), { status: 502 });
  }

  const tokens = await tokenRes.json() as {
    access_token:  string;
    refresh_token?: string;
    error?:        string;
  };

  if (tokens.error) {
    throw Object.assign(new Error(`Google OAuth error: ${tokens.error}`), { status: 401 });
  }

  const profileRes = await fetch(GOOGLE_USER_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    throw Object.assign(new Error('Failed to fetch Google profile'), { status: 502 });
  }

  const profile = await profileRes.json() as GoogleProfile;
  return {
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    profile,
  };
}

// ─── Upsert User from Google Profile ─────────────────────────────────────────

async function upsertGoogleUser(
  profile:      GoogleProfile,
  googleAccess:  string,
  googleRefresh: string | null,
): Promise<User | null> {
  // 1. Check if we already have this Google account linked
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: 'google', providerUserId: profile.sub } },
    include: { user: true },
  });

  if (existing) {
    // Update tokens and return existing user
    await prisma.oAuthAccount.update({
      where: { id: existing.id },
      data: {
        accessToken:  encryptPII(googleAccess),
        refreshToken: encryptNullable(googleRefresh) ?? undefined,
        displayName:  profile.name,
        avatarUrl:    profile.picture,
      },
    });
    return existing.user;
  }

  // 2. Check if a user with this email already exists (link the account)
  let user = await prisma.user.findUnique({ where: { email: profile.email } });

  // An existing account may only be adopted when Google has actually verified
  // the address. Without this check, `email_verified` was read solely to set a
  // column on brand-new users and never gated anything: anyone who could get a
  // Google identity bearing a MUNI user's address — a Workspace domain they
  // control, or an unverified alias — inherited that user's account, roles and
  // order history outright. Silent linking is account takeover with consent
  // screens on top.
  if (user && !profile.email_verified) return null;

  if (!user) {
    // 3. Create a new user (OAuth-only, no passwordHash needed)
    user = await prisma.user.create({
      data: {
        id:                randomUUID(),
        firstName:         profile.given_name  || profile.name.split(' ')[0],
        lastName:          profile.family_name || profile.name.split(' ').slice(1).join(' ') || '-',
        email:             profile.email,
        passwordHash:      '', // no password for OAuth-only accounts
        emailVerified:     profile.email_verified,
        profilePictureUrl: profile.picture,
        roles:             ['ROLE_CUSTOMER'],
        active:            true,
      },
    });
  }

  // 4. Link the OAuth account to the user
  await prisma.oAuthAccount.create({
    data: {
      userId:        user.id,
      provider:      'google',
      providerUserId: profile.sub,
      email:         profile.email,
      displayName:   profile.name,
      avatarUrl:     profile.picture,
      accessToken:   encryptPII(googleAccess),
      refreshToken:  encryptNullable(googleRefresh),
    },
  });

  return user;
}

// ─── Handle Google Callback ───────────────────────────────────────────────────

export interface OAuthResult {
  accessToken:  string;
  refreshToken: string;
  tokenType:    'Bearer';
  expiresIn:    number;
  redirectUrl:  string;
}

/**
 * `state` is the value the caller passed to /auth/google and the provider
 * echoed back. Only the native app sets it, and only to its own deep link —
 * see issueMuniTokensAndRedirect. A web login sends no state and is unaffected.
 */
export async function handleGoogleCallback(
  code: string,
  handshake?: PendingHandshake,
): Promise<OAuthOutcome> {
  const { accessToken: googleAccess, refreshToken: googleRefresh, profile } =
    await exchangeCode(code, handshake?.codeVerifier);

  const user = await upsertGoogleUser(profile, googleAccess, googleRefresh);
  if (!user) return unverifiedEmailOutcome();
  return issueMuniTokensAndRedirect(user, handshake?.returnTo ?? undefined);
}

// ─── Facebook OAuth2 Service ───────────────────────────────────────────────────
//
// Flow:
//   1. GET /api/v1/auth/facebook       → redirect to Facebook consent dialog
//   2. Facebook redirects to:
//      GET /api/v1/auth/facebook/callback?code=...
//   3. Exchange code → access_token → fetch Graph API profile
//   4. Find existing OAuthAccount → link, or create new User + OAuthAccount
//   5. Issue MUNI JWT (access + refresh)
//
// Required env vars:
//   FACEBOOK_APP_ID           – from Meta for Developers
//   FACEBOOK_APP_SECRET       – from Meta for Developers
//   FACEBOOK_CALLBACK_URL     – e.g. http://localhost:4001/api/v1/auth/facebook/callback

const FACEBOOK_APP_ID       = process.env.FACEBOOK_APP_ID       ?? '';
const FACEBOOK_APP_SECRET   = process.env.FACEBOOK_APP_SECRET   ?? '';
const FACEBOOK_CALLBACK_URL = process.env.FACEBOOK_CALLBACK_URL ??
  'http://localhost:4001/api/v1/auth/facebook/callback';

// Facebook Graph API endpoints (pin a version so behaviour doesn't drift under us)
const FACEBOOK_GRAPH_VERSION = 'v19.0';
const FACEBOOK_AUTH_URL      = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`;
const FACEBOOK_TOKEN_URL     = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`;
const FACEBOOK_USER_URL      = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me`;

export function buildFacebookAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id:     FACEBOOK_APP_ID,
    redirect_uri:  FACEBOOK_CALLBACK_URL,
    response_type: 'code',
    scope:         'email public_profile',
    ...(state ? { state } : {}),
  });
  return `${FACEBOOK_AUTH_URL}?${params}`;
}

interface FacebookProfile {
  id:         string;
  email?:     string;
  first_name: string;
  last_name:  string;
  name:       string;
  picture?:   { data?: { url?: string } };
}

async function exchangeFacebookCode(code: string): Promise<{
  accessToken: string;
  profile:     FacebookProfile;
}> {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    throw Object.assign(
      new Error('Facebook OAuth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.'),
      { status: 501 },
    );
  }

  // Facebook's token exchange is a GET with query params, unlike Google's POST body.
  const tokenParams = new URLSearchParams({
    client_id:     FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    redirect_uri:  FACEBOOK_CALLBACK_URL,
    code,
  });

  const tokenRes = await fetch(`${FACEBOOK_TOKEN_URL}?${tokenParams}`);

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw Object.assign(new Error(`Facebook token exchange failed: ${err}`), { status: 502 });
  }

  const tokens = await tokenRes.json() as { access_token?: string; error?: { message: string } };
  if (!tokens.access_token) {
    throw Object.assign(
      new Error(`Facebook OAuth error: ${tokens.error?.message ?? 'no access_token returned'}`),
      { status: 401 },
    );
  }

  const profileParams = new URLSearchParams({
    fields:       'id,email,first_name,last_name,name,picture.type(large)',
    access_token: tokens.access_token,
  });
  const profileRes = await fetch(`${FACEBOOK_USER_URL}?${profileParams}`);

  if (!profileRes.ok) {
    throw Object.assign(new Error('Failed to fetch Facebook profile'), { status: 502 });
  }

  const profile = await profileRes.json() as FacebookProfile;
  return { accessToken: tokens.access_token, profile };
}

async function upsertFacebookUser(
  profile: FacebookProfile,
  facebookAccess: string,
): Promise<User | null> {
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: 'facebook', providerUserId: profile.id } },
    include: { user: true },
  });

  if (existing) {
    await prisma.oAuthAccount.update({
      where: { id: existing.id },
      data: {
        accessToken: encryptPII(facebookAccess),
        displayName: profile.name,
        avatarUrl:   profile.picture?.data?.url,
      },
    });
    return existing.user;
  }

  // Facebook doesn't guarantee an email (e.g. phone-only accounts, or the
  // user declined the email permission) — fall back to a synthetic,
  // non-collidable address rather than crashing the login.
  const email = profile.email ?? `fb-${profile.id}@users.noreply.muni.ug`;

  let user = await prisma.user.findUnique({ where: { email } });

  // Facebook exposes no `email_verified` flag. What it documents instead is
  // that the `email` field is omitted entirely unless the address is confirmed
  // on the Facebook account — so its presence is the confirmation signal, and
  // its absence means we are looking at the synthetic
  // `fb-<id>@users.noreply.muni.ug` address above.
  //
  // That is a weaker assurance than Google's or Apple's explicit claim, and it
  // rests on Graph API behaviour rather than a signed assertion. Treat it as
  // the floor, not the goal: the durable fix is to require a linking step from
  // an already-authenticated MUNI session, at which point none of this
  // provider-asserted-email reasoning is load-bearing.
  if (user && !profile.email) return null;

  if (!user) {
    user = await prisma.user.create({
      data: {
        id:            randomUUID(),
        firstName:     profile.first_name || profile.name.split(' ')[0],
        lastName:      profile.last_name  || profile.name.split(' ').slice(1).join(' ') || '-',
        email,
        passwordHash:  '',
        emailVerified: !!profile.email, // Facebook-verified email is as good as ours
        profilePictureUrl: profile.picture?.data?.url,
        roles:         ['ROLE_CUSTOMER'],
        active:        true,
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: {
      userId:         user.id,
      provider:       'facebook',
      providerUserId: profile.id,
      email:          profile.email,
      displayName:    profile.name,
      avatarUrl:      profile.picture?.data?.url,
      accessToken:    encryptPII(facebookAccess),
    },
  });

  return user;
}

// Facebook is the one provider without PKCE here: its Login flow supports it
// only for some app configurations, and a code_challenge it silently ignores
// buys nothing. The nonce check in the controller still applies to it.
export async function handleFacebookCallback(
  code: string,
  handshake?: PendingHandshake,
): Promise<OAuthOutcome> {
  const { accessToken: facebookAccess, profile } = await exchangeFacebookCode(code);
  const user = await upsertFacebookUser(profile, facebookAccess);
  if (!user) return unverifiedEmailOutcome();
  return issueMuniTokensAndRedirect(user, handshake?.returnTo ?? undefined);
}

// ─── Apple ("Sign in with Apple") Service ──────────────────────────────────────
//
// Apple's flow differs from Google/Facebook in three load-bearing ways:
//   1. The client secret isn't a static string — it's a short-lived JWT you
//      sign yourself with your Apple private key (ES256).
//   2. The callback is a POST (response_mode=form_post is required whenever
//      the `name`/`email` scopes are requested), not a GET with query params.
//   3. Apple only sends the user's name ONCE, on their very first
//      authorization, as a JSON blob in the form body — never in the
//      id_token, and never again on subsequent logins.
//
// Required env vars:
//   APPLE_CLIENT_ID    – the Services ID (e.g. "ug.muni.web"), not the App ID
//   APPLE_TEAM_ID       – Apple Developer Team ID
//   APPLE_KEY_ID        – Key ID of the Sign in with Apple private key
//   APPLE_PRIVATE_KEY   – contents of the .p8 private key file (PEM, ES256).
//                         Store with literal \n escapes in .env and unescape below.
//   APPLE_CALLBACK_URL  – e.g. http://localhost:4001/api/v1/auth/apple/callback

const APPLE_CLIENT_ID   = process.env.APPLE_CLIENT_ID   ?? '';
const APPLE_TEAM_ID     = process.env.APPLE_TEAM_ID     ?? '';
const APPLE_KEY_ID      = process.env.APPLE_KEY_ID      ?? '';
const APPLE_PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
const APPLE_CALLBACK_URL = process.env.APPLE_CALLBACK_URL ??
  'http://localhost:4001/api/v1/auth/apple/callback';

const APPLE_AUTH_URL  = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_KEYS_URL  = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER    = 'https://appleid.apple.com';

export function buildAppleAuthUrl(state?: string, codeChallenge?: string): string {
  const params = new URLSearchParams({
    client_id:     APPLE_CLIENT_ID,
    redirect_uri:  APPLE_CALLBACK_URL,
    response_type: 'code',
    response_mode: 'form_post', // required when scope includes name/email
    scope:         'name email',
    ...(state ? { state } : {}),
    ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: 'S256' } : {}),
  });
  return `${APPLE_AUTH_URL}?${params}`;
}

/** Apple's client_secret is a JWT we sign ourselves, valid for a short window. */
function buildAppleClientSecret(): string {
  if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    throw Object.assign(
      new Error(
        'Apple Sign In is not configured. Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY.',
      ),
      { status: 501 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: APPLE_TEAM_ID,
      iat: now,
      exp: now + 300, // 5 minutes — only needs to survive one token exchange
      aud: APPLE_ISSUER,
      sub: APPLE_CLIENT_ID,
    },
    APPLE_PRIVATE_KEY,
    { algorithm: 'ES256', keyid: APPLE_KEY_ID },
  );
}

interface AppleIdTokenPayload {
  iss:            string;
  aud:            string;
  sub:            string;   // stable Apple user id
  email?:         string;
  email_verified?: boolean | string; // Apple sends this as a string sometimes
}

// Apple's JWKS rotate infrequently — cache for the process lifetime rather
// than fetching on every login.
let appleJwksCache: { kid: string; jwk: JsonWebKey }[] | null = null;

async function getAppleJwks(): Promise<{ kid: string; jwk: JsonWebKey }[]> {
  if (appleJwksCache) return appleJwksCache;

  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) {
    throw Object.assign(new Error('Failed to fetch Apple signing keys'), { status: 502 });
  }
  const body = await res.json() as { keys: Array<JsonWebKey & { kid: string }> };
  appleJwksCache = body.keys.map((jwk) => ({ kid: jwk.kid, jwk }));
  return appleJwksCache;
}

/** Verifies the id_token's signature against Apple's published JWKS and checks
 *  standard claims — this is the difference between trusting Apple's identity
 *  assertion and trusting whatever JSON a client happened to POST us. */
async function verifyAppleIdToken(idToken: string): Promise<AppleIdTokenPayload> {
  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded && typeof decoded !== 'string' ? decoded.header.kid : undefined;
  if (!kid) {
    throw Object.assign(new Error('Apple id_token is missing a key id'), { status: 401 });
  }

  const jwks = await getAppleJwks();
  const matched = jwks.find((k) => k.kid === kid);
  if (!matched) {
    throw Object.assign(new Error('No matching Apple signing key for this id_token'), { status: 401 });
  }

  const publicKey = createPublicKey({ key: matched.jwk as unknown as Record<string, unknown>, format: 'jwk' });

  try {
    return jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      audience:   APPLE_CLIENT_ID,
      issuer:     APPLE_ISSUER,
    }) as unknown as AppleIdTokenPayload;
  } catch (e) {
    throw Object.assign(new Error(`Apple id_token verification failed: ${(e as Error).message}`), { status: 401 });
  }
}

async function exchangeAppleCode(code: string, codeVerifier?: string): Promise<AppleIdTokenPayload> {
  const clientSecret = buildAppleClientSecret();

  const tokenRes = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     APPLE_CLIENT_ID,
      client_secret: clientSecret,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  APPLE_CALLBACK_URL,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw Object.assign(new Error(`Apple token exchange failed: ${err}`), { status: 502 });
  }

  const tokens = await tokenRes.json() as { id_token?: string; error?: string };
  if (!tokens.id_token) {
    throw Object.assign(new Error(`Apple OAuth error: ${tokens.error ?? 'no id_token returned'}`), { status: 401 });
  }

  return verifyAppleIdToken(tokens.id_token);
}

/** The `user` form field Apple sends alongside the code — JSON, and only
 *  present on the very first authorization for a given Apple ID + app. */
interface AppleUserFormField {
  name?: { firstName?: string; lastName?: string };
  email?: string;
}

async function upsertAppleUser(
  claims: AppleIdTokenPayload,
  nameFromFirstAuth: AppleUserFormField['name'] | undefined,
): Promise<User | null> {
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: 'apple', providerUserId: claims.sub } },
    include: { user: true },
  });

  if (existing) return existing.user;

  const email = claims.email ?? `apple-${claims.sub}@users.noreply.muni.ug`;
  // Apple sends email_verified as a boolean or the string "true" depending on
  // the flow, which is why this is not a bare truthiness test.
  const appleVerifiedEmail =
    claims.email_verified === true || claims.email_verified === 'true';

  let user = await prisma.user.findUnique({ where: { email } });

  // Same rule as Google: an existing account is only adopted on a verified
  // claim. Apple's private-relay addresses are always verified, so this does
  // not affect Hide My Email users.
  if (user && !appleVerifiedEmail) return null;

  if (!user) {
    user = await prisma.user.create({
      data: {
        id:            randomUUID(),
        // Apple only ever tells us the name once (first auth) — if this
        // isn't that first auth and no User row exists yet either, we have
        // no name to use. "Apple User" is the honest fallback, not a guess.
        firstName:     nameFromFirstAuth?.firstName || 'Apple',
        lastName:      nameFromFirstAuth?.lastName  || 'User',
        email,
        passwordHash:  '',
        emailVerified: appleVerifiedEmail,
        roles:         ['ROLE_CUSTOMER'],
        active:        true,
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: {
      userId:         user.id,
      provider:       'apple',
      providerUserId: claims.sub,
      email:          claims.email,
      displayName:    nameFromFirstAuth ? `${nameFromFirstAuth.firstName ?? ''} ${nameFromFirstAuth.lastName ?? ''}`.trim() : null,
    },
  });

  return user;
}

export async function handleAppleCallback(
  code: string,
  userFormField?: string,
  handshake?: PendingHandshake,
): Promise<OAuthOutcome> {
  const claims = await exchangeAppleCode(code, handshake?.codeVerifier);

  let name: AppleUserFormField['name'];
  if (userFormField) {
    try {
      name = (JSON.parse(userFormField) as AppleUserFormField).name;
    } catch {
      // Malformed `user` field — proceed without a name rather than failing the login.
    }
  }

  const user = await upsertAppleUser(claims, name);
  if (!user) return unverifiedEmailOutcome();
  return issueMuniTokensAndRedirect(user, handshake?.returnTo ?? undefined);
}

// ─── Shared: Issue MUNI Tokens + Build Redirect ────────────────────────────────
// Factored out of handleGoogleCallback so Facebook/Apple don't duplicate it.

/**
 * Custom schemes the native app registers, and the only values of `state` that
 * may steer the post-login redirect.
 *
 * `muni://` is a release build; `exp://` and `exp+muni://` are Expo Go and dev
 * clients, which is how the flow is exercised during development.
 *
 * Everything else — including any https URL, however plausible — falls back to
 * FRONTEND_REDIRECT_URL. `state` is attacker-controllable (it is simply
 * reflected back by the provider), and the redirect carries a live access and
 * refresh token in its query string, so an unchecked value here would be an
 * open redirect that hands the session to whoever crafted the link.
 */
const APP_SCHEME_PATTERN = /^(muni|exp(\+[a-z0-9-]+)?):\/\//i;

/**
 * The mobile return address, when this login came from the app.
 *
 * The app puts its deep link in `state` on the way in (`/auth/google?state=muni://auth/callback`),
 * the provider hands `state` back verbatim on the callback, and it lands here.
 * Anything unrecognised is discarded rather than trusted.
 *
 * Exported for the redirect-target tests: this is the check that stands
 * between `state` and an open redirect carrying live tokens, so it is worth
 * testing on its own rather than only through a full OAuth exchange.
 */
export function appReturnUrl(state?: string): URL | null {
  if (!state || !APP_SCHEME_PATTERN.test(state)) return null;
  try {
    return new URL(state);
  } catch {
    // Matched the scheme but isn't parseable as a URL — treat as absent.
    return null;
  }
}

/**
 * The origin the web app is served from — where a social login that cannot
 * complete gets sent instead of to the callback.
 *
 * Derived from FRONTEND_REDIRECT_URL so there is one source of truth for
 * "where the browser came from", rather than a second variable that can
 * disagree with the first.
 */
function frontendUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(path, new URL(FRONTEND_REDIRECT).origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * What a completed provider handshake is allowed to turn into.
 *
 * Every branch carries `redirectUrl`, so the controller stays a single
 * `res.redirect(result.redirectUrl)` and cannot forget to handle one of them.
 * Only AUTHENTICATED carries tokens.
 */
export type OAuthOutcome =
  | ({ status: 'AUTHENTICATED' } & OAuthResult)
  | { status: 'MFA_REQUIRED';            redirectUrl: string }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; redirectUrl: string }
  | { status: 'ACCOUNT_DISABLED';        redirectUrl: string }
  | { status: 'UNVERIFIED_EMAIL';        redirectUrl: string };

/**
 * The provider gave us an address that already belongs to a MUNI account, but
 * did not vouch for the person holding it.
 *
 * Deliberately does NOT create a second account under a mangled address: that
 * would leave two records for one human and a confusing "your email is taken"
 * on the next password signup. The honest answer is to stop and say why, so the
 * account owner can sign in the way they already can and link the provider from
 * inside a session they proved they own.
 */
function unverifiedEmailOutcome(): OAuthOutcome {
  return {
    status: 'UNVERIFIED_EMAIL',
    redirectUrl: frontendUrl('/auth/error', { reason: 'unverified_email' }),
  };
}

/**
 * Turn a verified provider identity into a MUNI session — or into the next step
 * required before one can exist.
 *
 * This is the OAuth equivalent of auth.service's `login()`, and it now applies
 * the same three gates in the same order. It previously applied none of them:
 * it minted a full token pair the moment a provider said "yes", which meant
 *
 *   • a deactivated account could sign straight back in, and
 *   • every account in MFA_REQUIRED_ROLES — admins, super admins and sellers,
 *     the exact accounts the password path refuses to admit without a second
 *     factor — could skip that factor entirely by clicking "Continue with
 *     Google" instead of typing a password.
 *
 * A second front door to the same building has to have the same lock.
 */
async function issueMuniTokensAndRedirect(user: User, state?: string): Promise<OAuthOutcome> {
  // ── Gate 1: is the account allowed to hold a session at all? ───────────────
  if (!user.active) {
    return {
      status: 'ACCOUNT_DISABLED',
      redirectUrl: frontendUrl('/auth/error', { reason: 'account_disabled' }),
    };
  }

  // ── Gate 2: does this account owe a second factor? ─────────────────────────
  // `.catch(() => null)` mirrors login(): a 2FA lookup failure must not be
  // read as "no second factor configured" for an account that has one, but it
  // also must not 500 a login for an account that does not. The privileged
  // branch below is what covers the dangerous half of that trade.
  const twoFactor = await twoFactorRepository.find(user.id).catch(() => null);

  if (requiresSecondFactor(user.roles) && !twoFactor?.enabled) {
    // Same no-grandfathering rule as the password path: a privileged account
    // with no factor enrolled is sent to enrol, not issued tokens.
    return {
      status: 'MFA_ENROLLMENT_REQUIRED',
      redirectUrl: frontendUrl('/auth/2fa/challenge', {
        enrollment_token: createMfaChallengeToken(user.id, 'enrol'),
      }),
    };
  }

  if (twoFactor?.enabled) {
    // The challenge token carries no roles and names its own purpose, so on its
    // own it authorizes nothing — it is only redeemable at 2fa/authenticate.
    return {
      status: 'MFA_REQUIRED',
      redirectUrl: frontendUrl('/auth/2fa/challenge', {
        token: createMfaChallengeToken(user.id, 'verify'),
      }),
    };
  }

  // ── Cleared: mint the session ──────────────────────────────────────────────
  const family      = randomUUID();
  const muniRefresh = createRefreshToken(user.id, family);
  const refreshHash = await bcrypt.hash(muniRefresh, 10);
  const expiresAt   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refreshHash, family, expiresAt },
  });

  const muniAccess = createAccessToken(user.id, user.roles);

  // Every other login path records the moment it happened. Without this a
  // social login left no trace in either `lastLoginAt` or the audit trail, so
  // an account could be signed into indefinitely and look untouched.
  await prisma.user.update({
    where: { id: user.id },
    data:  { lastLoginAt: new Date() },
  });

  AuditLogger.logAction({
    actorId:    user.id,
    actorRole:  toActorRole(user.roles[0]),
    action:     'auth.oauth_login_success',
    resource:   'UserSession',
    resourceId: user.id,
  });

  // ── Hand the session over behind a one-time code, not in the URL ──────────
  //
  // These two tokens used to be set as `access_token` and `refresh_token`
  // query parameters on the redirect below. A URL is not a private channel:
  // it lands in browser history, in the Referer header of anything the
  // callback page subsequently loads, and in the access log of every proxy on
  // the path — nginx's included. Replacing them with a 60-second single-use
  // code means the worst a leaked redirect URL yields is a code that has
  // already been spent.
  const exchangeCodeValue = await createExchangeCode({
    accessToken:  muniAccess,
    refreshToken: muniRefresh,
    tokenType:    'Bearer',
    expiresIn:    ACCESS_TOKEN_TTL_SECONDS,
  });

  // The app's own deep link when it started the flow, the web app otherwise.
  // Both legs now receive the same single parameter and redeem it the same way
  // at POST /api/v1/auth/exchange — a custom scheme is claimable by any other
  // app on the device, so the native leg is not a private channel either.
  const redirectUrl = appReturnUrl(state) ?? new URL(FRONTEND_REDIRECT);
  redirectUrl.searchParams.set('code', exchangeCodeValue);

  return {
    status:       'AUTHENTICATED',
    accessToken:  muniAccess,
    refreshToken: muniRefresh,
    tokenType:    'Bearer',
    expiresIn:    ACCESS_TOKEN_TTL_SECONDS,
    redirectUrl:  redirectUrl.toString(),
  };
}
