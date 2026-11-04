import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { establishSession } from '@/store/slices/authSlice';
import { showToast } from '@/store/slices/uiSlice';
import { authApi } from '@/api/auth.api';
import { INK, MUTED } from './AuthUI';

/**
 * Where a social login lands.
 *
 * auth-service ends the flow by redirecting the browser here with a single
 * one-time `code`. This trades that code for the session at
 * POST /auth/exchange, which stores the tokens under the same keys the password
 * flow uses and sets the httpOnly refresh cookie server-side — so the axios
 * interceptor and the refresh path work exactly as they do after an email
 * sign-in.
 *
 * The tokens used to arrive in this URL's query string directly. They no longer
 * do, and that is the point: a URL is written to browser history, sent as a
 * Referer to anything this page subsequently loads, and recorded in the access
 * log of every proxy between here and the service. A code that is single-use
 * and expires in sixty seconds leaks none of that.
 *
 * This is also mounted at /auth/error, where auth-service sends a denied or
 * failed authorization. No code arrives on that leg, so it falls through to the
 * reason-specific messaging below.
 */

/**
 * auth-service's `reason` values, in shopper-readable form.
 *
 * Everything used to share one message — "This sign-in method is temporarily
 * unavailable" — which told someone who simply cancelled the Google dialog that
 * MUNI was broken, and told someone whose account is disabled nothing at all.
 */
const REASON_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  account_disabled: 'This account has been deactivated. Contact support if you think that is wrong.',
  unverified_email:
    'That provider could not confirm your email address, and an account already uses it. ' +
    'Sign in with your password instead, then link the provider from your account settings.',
  invalid_state:
    'That sign-in link has expired or did not come from this browser. Please try again.',
};

const GENERIC_FAILURE = 'We could not complete that sign-in. Please try again.';

export function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // StrictMode mounts effects twice in development. Without this the second
  // pass re-POSTs a code the first has already spent, which now genuinely
  // fails — the code is single-use by design.
  const handled = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = params.get('code');
    const reason = params.get('reason');

    // Denied consent, a refused callback, or a redirect that carried no code.
    if (!code) {
      const text = (reason && REASON_MESSAGES[reason]) || GENERIC_FAILURE;
      setMessage(text);
      dispatch(showToast(text, 'error'));
      navigate('/login', { replace: true });
      return;
    }

    void (async () => {
      try {
        const session = await authApi.exchangeOAuthCode(code);
        // Awaited, not fired off: /dashboard is behind PrivateRoute, which reads
        // `isAuthenticated` from Redux — and only a fulfilled profile fetch sets
        // it. Navigating first lands on the guard mid-flight and bounces back.
        await dispatch(establishSession(session)).unwrap();
        // Replace, so Back does not return to a URL with a spent code in it.
        navigate('/dashboard', { replace: true });
      } catch {
        setMessage(GENERIC_FAILURE);
        dispatch(showToast(GENERIC_FAILURE, 'error'));
        navigate('/login', { replace: true });
      }
    })();
  }, [dispatch, navigate, params]);

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }} aria-live="polite">
      <p style={{ fontSize: 18, fontWeight: 700, color: INK, marginBottom: 'var(--space-2)' }}>
        {message ? 'Sign-in could not be completed' : 'Signing you in…'}
      </p>
      <p style={{ fontSize: 14, color: MUTED }}>
        {message ?? 'One moment while we finish setting up your session.'}
      </p>
    </div>
  );
}
