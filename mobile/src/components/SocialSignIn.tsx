import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { authProvidersApi, PROVIDER_CATALOGUE, type AuthProvider } from '../api/authProviders.api';
import { authApi } from '../api/auth.api';
import { API_URL } from '../constants';
import { Colors, Spacing } from '../constants/theme';
import { useAppDispatch } from '../store/hooks';
import { loadStoredAuthThunk, persistTokensThunk } from '../store/auth.slice';
import { DEFAULT_AUTH_DESTINATION } from '../utils/authRedirect';
import { logger } from '../utils/logger';

/** Only providers auth-service reports; unknown names fall back to a generic mark. */
const PROVIDER_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  google: 'google',
  apple: 'apple',
  facebook: 'facebook',
};

/**
 * Each provider's own mark colour. The glyph set has no multicolour Google
 * mark, so its brand blue stands in rather than a flat grey that would read as
 * a generic icon.
 */
const PROVIDER_COLORS: Record<string, string> = {
  google: '#4285F4',
  apple: '#000000',
  facebook: '#1877F2',
};

const UNAVAILABLE_MESSAGE = 'This sign-in method is temporarily unavailable';

/**
 * auth-service's `reason` values, in shopper-readable form.
 *
 * Everything used to share UNAVAILABLE_MESSAGE, which told someone whose
 * account is deactivated that the sign-in method was down — and told someone
 * whose email could not be confirmed nothing they could act on.
 */
const REASON_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  account_disabled: 'This account has been deactivated. Contact support if you think that is wrong.',
  unverified_email:
    'That provider could not confirm your email, and an account already uses it. ' +
    'Sign in with your password, then link the provider from your account settings.',
  invalid_state: 'That sign-in attempt expired. Please try again.',
};

/**
 * Social sign-in.
 *
 * All three are always offered, so the screen looks the same whatever a given
 * deployment has configured. `GET /api/v1/auth/providers` decides *behaviour*
 * rather than visibility: a provider whose credentials are missing still
 * renders, and tapping it says so instead of opening a browser onto the 501
 * JSON that `/auth/:provider` returns in that state.
 *
 * `EXPO_PUBLIC_SHOW_SOCIAL_BUTTONS=false` hides the section entirely. It
 * defaults to showing, so no configuration is needed for the normal case.
 *
 * ── How the tokens get back ──────────────────────────────────────────────
 * The provider consent screen is a real web page, so this opens an auth
 * session in the system browser rather than pretending to complete in-app.
 *
 * The app's own deep link rides along as the OAuth `state`, which the provider
 * echoes back to auth-service; seeing a scheme it recognises, auth-service
 * redirects the tokens straight here instead of to the web app. Reaching that
 * URL is also what closes the browser and resolves openAuthSessionAsync.
 *
 * Cancelling is not a failure: dismissing the browser leaves the shopper on
 * the form with the email path still open, and says nothing.
 */
interface SocialSignInProps {
  /**
   * `stack` is login's full-width column of "Continue with …" buttons.
   * `row` is registration's three-up row labelled with just the provider name,
   * where these sit beside a form that already carries the primary action.
   */
  variant?: 'stack' | 'row';
  /** Where to land after a successful sign-in — the screen's own redirect. */
  redirectTo?: string;
}

/** "Continue with Google" -> "Google", for the compact row. */
function shortName(name: string, displayName: string): string {
  const stripped = displayName.replace(/^continue with\s+/i, '').trim();
  return stripped || name.charAt(0).toUpperCase() + name.slice(1);
}

/** Expo Router hands query params back as `string | string[]`. */
function firstParam(value: string | string[] | undefined | null): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function SocialSignIn({ variant = 'stack', redirectTo }: SocialSignInProps) {
  const dispatch = useAppDispatch();
  const [providers, setProviders] = useState<AuthProvider[]>(PROVIDER_CATALOGUE);
  const [unavailable, setUnavailable] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authProvidersApi.list().then((list) => {
      if (!cancelled) setProviders(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (process.env.EXPO_PUBLIC_SHOW_SOCIAL_BUTTONS === 'false') return null;
  if (providers.length === 0) return null;

  const open = async (provider: AuthProvider) => {
    if (!provider.enabled) {
      setUnavailable(UNAVAILABLE_MESSAGE);
      return;
    }
    if (busy) return;

    setUnavailable('');
    setBusy(true);

    // `muni://auth/callback` in a build, `exp://…/--/auth/callback` in Expo Go.
    // auth-service accepts both schemes as a redirect target; anything else it
    // ignores in favour of the web app.
    const returnUrl = Linking.createURL('auth/callback');
    const startUrl = `${API_URL}${provider.loginUrl}?state=${encodeURIComponent(returnUrl)}`;

    try {
      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);

      // 'cancel' (dismissed) and 'dismiss' are the shopper backing out.
      if (result.type !== 'success') return;

      const { queryParams } = Linking.parse(result.url);
      const exchangeCode = firstParam(queryParams?.code as string | string[] | undefined);
      const reason = firstParam(queryParams?.reason as string | string[] | undefined);

      if (!exchangeCode) {
        // auth-service sends a `reason` when it refused the login outright —
        // a deactivated account, an email it could not confirm, or a callback
        // that did not match a handshake it started.
        setUnavailable(REASON_MESSAGES[reason ?? ''] ?? UNAVAILABLE_MESSAGE);
        return;
      }

      // The deep link carries a one-time code, not the tokens themselves: any
      // app on the device can claim the `muni://` scheme and receive this same
      // link, so it must not be the thing that grants a session. The code is
      // spent here, over TLS, and is worthless afterwards.
      const session = await authApi.exchangeOAuthCode(exchangeCode);

      // Same SecureStore keys the password login writes, then the ordinary
      // restore path to pull the profile the roles checks need — no second
      // copy of either.
      await dispatch(
        persistTokensThunk({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        }),
      ).unwrap();
      await dispatch(loadStoredAuthThunk()).unwrap();

      router.replace((redirectTo ?? DEFAULT_AUTH_DESTINATION) as never);
    } catch (err) {
      logger.error('[SocialSignIn] OAuth session failed:', err);
      setUnavailable(UNAVAILABLE_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.rule} />
        <Text style={styles.dividerText}>
          {variant === 'row' ? 'or continue with' : 'or'}
        </Text>
        <View style={styles.rule} />
      </View>

      <View style={variant === 'row' ? styles.row : undefined}>
      {providers.map((provider) => (
        <TouchableOpacity
          key={provider.name}
          style={[styles.button, variant === 'row' && styles.buttonCompact]}
          onPress={() => void open(provider)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={provider.displayName}
          accessibilityState={{ disabled: busy }}
          activeOpacity={0.9}
        >
          {/* Anchored left, outside the flex flow, so every label stays centred
              in the button whatever the icon's width. */}
          <MaterialCommunityIcons
            name={PROVIDER_ICONS[provider.name] ?? 'account-circle-outline'}
            size={20}
            color={PROVIDER_COLORS[provider.name] ?? Colors.text.primary}
            style={variant === 'row' ? styles.iconInline : styles.icon}
          />
          <Text
            style={[styles.buttonText, variant === 'stack' && styles.buttonTextStack]}
            numberOfLines={1}
          >
            {variant === 'row'
              ? shortName(provider.name, provider.displayName)
              : provider.displayName}
          </Text>
        </TouchableOpacity>
      ))}
      </View>

      <Snackbar visible={!!unavailable} onDismiss={() => setUnavailable('')} duration={4000}>
        {unavailable}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: Spacing.lg },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  rule: { flex: 1, height: 1, backgroundColor: Colors.gray[200] },
  dividerText: {
    marginHorizontal: Spacing.md,
    color: Colors.text.muted,
    fontSize: 14,
  },
  // The stacked login button: full width, 56 tall, fully rounded.
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 28,
    height: 56,
    marginBottom: 12,
  },
  icon: { position: 'absolute', left: 16 },
  /** In the compact row the icon sits beside the label rather than pinned. */
  iconInline: { marginRight: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  buttonCompact: { flexGrow: 1, flexBasis: 96, height: 48, borderRadius: 24, marginBottom: 0 },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  buttonTextStack: { fontSize: 16 },
});
