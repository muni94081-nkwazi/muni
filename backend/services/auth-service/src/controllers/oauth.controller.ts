import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  buildGoogleAuthUrl, handleGoogleCallback,
  buildFacebookAuthUrl, handleFacebookCallback,
  buildAppleAuthUrl, handleAppleCallback,
} from '../services/oauth.service.js';
import {
  consumeExchangeCode,
  consumeHandshake,
  createPkcePair,
  startHandshake,
  OAUTH_STATE_COOKIE,
  OAUTH_HANDSHAKE_TTL_SEC,
  type PendingHandshake,
} from '../security/oauth-state.store.js';
import { appReturnUrl } from '../services/oauth.service.js';
import { refreshCookieOptions, REFRESH_COOKIE_MAX_AGE_MS } from '../security/cookie.js';

export const oauthRouter = Router();

function redirectToFrontendError(res: Response, reason: string) {
  const frontendError = process.env.FRONTEND_REDIRECT_URL
    ? `${new URL(process.env.FRONTEND_REDIRECT_URL).origin}/auth/error?reason=${encodeURIComponent(reason)}`
    : '/auth/error';
  res.redirect(frontendError);
}

// ─── Starting a flow ──────────────────────────────────────────────────────────
//
// `state` used to be the caller's own value, passed through to the provider and
// back, and used directly as the post-login redirect target. That made it two
// things at once, and both were attacker-controllable:
//
//   • a redirect target the provider hands back verbatim, and
//   • the only thing distinguishing "a callback this browser started" from
//     "a callback someone else started and pointed at this browser" — which it
//     could not distinguish at all, because any value was accepted.
//
// Now `state` is an opaque server-minted nonce and nothing else. The return
// address and the PKCE verifier are held server-side against that nonce, so a
// crafted `state` cannot steer where tokens go, and a callback whose nonce we
// did not mint (or that has already been redeemed) is refused.
//
// The caller still passes its deep link as `?state=` on the way in — that is
// the app's existing contract and is unchanged — but it is now validated
// against the app-scheme allowlist and stored, rather than round-tripped.

/**
 * Bind the handshake to this browser.
 *
 * SameSite must be 'lax', not 'strict': the callback arrives as a cross-site
 * top-level navigation from the provider, and a Strict cookie is not sent on
 * one. Strict here would mean the cookie never comes back and every web login
 * fails the binding check.
 */
function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: OAUTH_HANDSHAKE_TTL_SEC * 1000,
  };
}

/**
 * Set up a pending handshake and hand back what the authorize URL needs.
 *
 * A native-app flow is identified by its `state` parsing as one of our own
 * schemes. Those have no cookie jar shared with this service, so they are not
 * cookie-bound; the single-use nonce is what protects them.
 */
async function beginFlow(
  req: Request,
  res: Response,
  provider: PendingHandshake['provider'],
): Promise<{ nonce: string; codeChallenge: string }> {
  const requested = typeof req.query.state === 'string' ? req.query.state : undefined;
  const appReturn = appReturnUrl(requested);

  const { codeVerifier, codeChallenge } = createPkcePair();
  const nonce = await startHandshake({
    provider,
    codeVerifier,
    returnTo: appReturn ? appReturn.toString() : null,
    browserBound: appReturn === null,
  });

  if (appReturn === null) {
    res.cookie(OAUTH_STATE_COOKIE, nonce, stateCookieOptions());
  }

  return { nonce, codeChallenge };
}

/**
 * Redeem the nonce the provider echoed back, and confirm it belongs to this
 * browser. Returns null when the callback does not correspond to a handshake
 * this service started — the caller must refuse rather than complete it.
 */
async function verifyFlow(
  req: Request,
  res: Response,
  state: string | undefined,
  provider: PendingHandshake['provider'],
): Promise<PendingHandshake | null> {
  const handshake = await consumeHandshake(state);
  if (!handshake) return null;

  // A nonce minted for one provider must not complete another's callback.
  if (handshake.provider !== provider) return null;

  if (handshake.browserBound) {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[OAUTH_STATE_COOKIE];
    if (!cookie || cookie !== state) return null;
  }

  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
  return handshake;
}

/** Every terminal state carries a redirect; only AUTHENTICATED carries tokens. */
function completeOutcome(res: Response, redirectUrl: string): void {
  res.redirect(redirectUrl);
}

// ─── GET /api/v1/auth/google ──────────────────────────────────────────────────

oauthRouter.get('/auth/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nonce, codeChallenge } = await beginFlow(req, res, 'google');
    res.redirect(buildGoogleAuthUrl(nonce, codeChallenge));
  } catch (e) {
    next(e);
  }
});

// ─── GET /api/v1/auth/google/callback ────────────────────────────────────────
// Google redirects here with ?code=... after the user grants permission.
// On success: redirect to the return address with a one-time exchange code.
// On failure: redirect to the frontend's /auth/error.

oauthRouter.get(
  '/auth/google/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code  = req.query.code  as string | undefined;
      const error = req.query.error as string | undefined;

      if (error) {
        // User denied access, or Google reported a problem of its own.
        redirectToFrontendError(res, error);
        return;
      }

      if (!code) {
        res.status(400).json({ message: 'Missing OAuth authorization code' });
        return;
      }

      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const handshake = await verifyFlow(req, res, state, 'google');
      if (!handshake) {
        redirectToFrontendError(res, 'invalid_state');
        return;
      }

      const result = await handleGoogleCallback(code, handshake);
      completeOutcome(res, result.redirectUrl);
    } catch (e) {
      next(e);
    }
  },
);

// ─── GET /api/v1/auth/facebook ─────────────────────────────────────────────────

oauthRouter.get('/auth/facebook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nonce } = await beginFlow(req, res, 'facebook');
    res.redirect(buildFacebookAuthUrl(nonce));
  } catch (e) {
    next(e);
  }
});

// ─── GET /api/v1/auth/facebook/callback ────────────────────────────────────────

oauthRouter.get(
  '/auth/facebook/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code  = req.query.code  as string | undefined;
      const error = req.query.error as string | undefined;

      if (error) {
        redirectToFrontendError(res, error);
        return;
      }
      if (!code) {
        res.status(400).json({ message: 'Missing OAuth authorization code' });
        return;
      }

      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const handshake = await verifyFlow(req, res, state, 'facebook');
      if (!handshake) {
        redirectToFrontendError(res, 'invalid_state');
        return;
      }

      const result = await handleFacebookCallback(code, handshake);
      completeOutcome(res, result.redirectUrl);
    } catch (e) {
      next(e);
    }
  },
);

// ─── GET /api/v1/auth/apple ─────────────────────────────────────────────────────
// Apple's authorize request is still a GET the browser navigates to — only the
// callback differs (POST, because response_mode=form_post).

oauthRouter.get('/auth/apple', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nonce, codeChallenge } = await beginFlow(req, res, 'apple');
    res.redirect(buildAppleAuthUrl(nonce, codeChallenge));
  } catch (e) {
    next(e);
  }
});

// ─── POST /api/v1/auth/apple/callback ──────────────────────────────────────────
// Apple POSTs here (form_post response mode) with `code`, optionally `error`,
// and — only on the user's very first authorization — a `user` field
// containing their name as a JSON string.

oauthRouter.post(
  '/auth/apple/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code  = req.body?.code  as string | undefined;
      const error = req.body?.error as string | undefined;
      const userFormField = req.body?.user as string | undefined;

      if (error) {
        redirectToFrontendError(res, error);
        return;
      }
      if (!code) {
        res.status(400).json({ message: 'Missing OAuth authorization code' });
        return;
      }

      // form_post, so Apple returns `state` in the body rather than the query.
      const state = typeof req.body?.state === 'string' ? req.body.state : undefined;
      const handshake = await verifyFlow(req, res, state, 'apple');
      if (!handshake) {
        redirectToFrontendError(res, 'invalid_state');
        return;
      }

      const result = await handleAppleCallback(code, userFormField, handshake);
      completeOutcome(res, result.redirectUrl);
    } catch (e) {
      next(e);
    }
  },
);

// ─── POST /api/v1/auth/exchange ───────────────────────────────────────────────
//
// The second half of a social login. The callback redirect now carries a
// one-time `code` instead of the tokens themselves; this trades that code for
// the session, once, within sixty seconds.
//
// It is deliberately unauthenticated: the code IS the credential, and the
// client presenting it has no session yet — that is the thing it is asking
// for. What keeps it safe is that the code is single-use (redeemed with an
// atomic GETDEL), short-lived, and unguessable.

oauthRouter.post('/auth/exchange', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = (req.body as { code?: string } | undefined)?.code;

    if (!code) {
      res.status(400).json({ message: 'An exchange code is required' });
      return;
    }

    const session = await consumeExchangeCode(code);
    if (!session) {
      // Unknown, expired, or already spent — all indistinguishable to the
      // caller on purpose, so this cannot be used to probe which codes existed.
      res.status(400).json({ message: 'This sign-in link has expired. Please try again.' });
      return;
    }

    // Same httpOnly cookie the password login sets, so a social session refreshes
    // through exactly the same path as an email one rather than depending on the
    // copy the client keeps. Harmless for the native app, which ignores it.
    res.cookie('refreshToken', session.refreshToken, refreshCookieOptions(REFRESH_COOKIE_MAX_AGE_MS));

    // Enveloped, like every other endpoint that hands back a session — see the
    // contract note at the top of auth.controller.ts.
    res.json({ success: true, data: session });
  } catch (e) {
    next(e);
  }
});

// ─── GET /api/v1/auth/providers ───────────────────────────────────────────────
// Returns which OAuth providers are configured, so the frontend can
// show/hide social login buttons dynamically.

oauthRouter.get('/auth/providers', (_req: Request, res: Response) => {
  res.json({
    providers: [
      {
        name:        'google',
        enabled:     !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        loginUrl:    '/api/v1/auth/google',
        displayName: 'Continue with Google',
      },
      {
        name:        'facebook',
        enabled:     !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
        loginUrl:    '/api/v1/auth/facebook',
        displayName: 'Continue with Facebook',
      },
      {
        name:        'apple',
        enabled:     !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
        loginUrl:    '/api/v1/auth/apple',
        displayName: 'Continue with Apple',
      },
    ],
  });
});
