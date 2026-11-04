import { useCallback, useEffect, useRef, useState } from 'react';
import { authProvidersApi, PROVIDER_CATALOGUE, type AuthProvider } from '@/api/authProviders.api';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { showToast } from '@/store/slices/uiSlice';

/**
 * What a shopper is told when they click a provider this deployment cannot
 * complete. It names the provider and points at the way in that does work,
 * because "unavailable" on its own leaves them with nothing to try.
 *
 * It deliberately does not say "temporarily". Nothing is down: auth-service
 * has no credentials for this provider, and no amount of waiting changes that
 * — telling someone to come back later would be a lie.
 */
export function providerUnavailableMessage(displayName: string): string {
  return `${displayName} is not available on MUNI yet — sign in with your email and password.`;
}

/**
 * Click behaviour and availability for the Google/Apple/Facebook buttons on
 * both auth screens.
 *
 * Discovery decides behaviour and appearance, never presence: the buttons are
 * always rendered, so the page has the same shape whatever a deployment has
 * configured, and `GET /auth/providers` says which of them can actually
 * finish. One that cannot is rendered in a disabled state — visibly muted and
 * `aria-disabled` — so the shopper knows before clicking rather than after.
 *
 * It stays clickable in that state on purpose. A real `disabled` attribute
 * drops the button out of the accessibility tree and swallows the click, so
 * the only thing a screen-reader user or a keyboard user gets is silence;
 * answering with a toast that names the provider explains the state instead.
 *
 * The redirect for a working provider is a same-window navigation, not a
 * popup: the provider consent screen is a real page, and auth-service ends the
 * flow by redirecting the browser back to /auth/callback with the tokens.
 */
export function useSocialSignIn() {
  const dispatch = useAppDispatch();
  const [providers, setProviders] = useState<AuthProvider[]>(PROVIDER_CATALOGUE);
  // Discovery is in flight for a moment after mount. A click landing in that
  // window must not be judged against the catalogue's placeholder `enabled:
  // false` and told the provider is down, so it waits for the same promise.
  const lookup = useRef<Promise<AuthProvider[]> | null>(null);
  // ...and for the same reason the buttons must not render as disabled during
  // that window, which would flash every provider off and then on again.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    lookup.current = authProvidersApi.list();
    void lookup.current.then((list) => {
      if (cancelled) return;
      setProviders(list);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Whether the button should render in its honest disabled state. Only once
   * discovery has answered — before that, nothing is known and the button
   * stays in its normal state.
   */
  const isUnavailable = useCallback(
    (name: string): boolean =>
      resolved && providers.find((candidate) => candidate.name === name)?.enabled === false,
    [providers, resolved],
  );

  const start = useCallback(
    async (name: 'google' | 'apple' | 'facebook') => {
      const list = (await lookup.current) ?? providers;
      const provider = list.find((candidate) => candidate.name === name);

      if (!provider?.enabled) {
        const displayName =
          provider?.displayName.replace(/^Continue with /, '') ??
          name.charAt(0).toUpperCase() + name.slice(1);
        dispatch(showToast(providerUnavailableMessage(displayName), 'error'));
        return;
      }

      // Full-page navigation, so the browser — not fetch — follows the 302 to
      // the provider. `loginUrl` is the gateway path auth-service reports; it
      // is same-origin behind nginx and proxied by Vite in development.
      window.location.assign(provider.loginUrl);
    },
    [dispatch, providers],
  );

  return { providers, start, isUnavailable };
}
