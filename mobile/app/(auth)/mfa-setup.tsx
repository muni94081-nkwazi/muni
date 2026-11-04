import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Linking } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import { mfaApi, type EnrolmentSetup } from '@/api/mfa.api';
import { AuthScreen } from '@/components/AuthScreen';
import { CodeInput } from '@/components/CodeInput';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

const CODE_LENGTH = 6;

/**
 * Mandatory two-factor enrolment.
 *
 * Reached from login.tsx when auth-service answers MFA_ENROLLMENT_REQUIRED — a
 * privileged account (ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_SELLER) with no second
 * factor yet. Until now mobile routed that branch to the two-factor screen,
 * which could only say "set this up on the web": the account was locked out of
 * the app entirely.
 *
 * What this screen deliberately does NOT do:
 *
 *   • It never establishes a session. auth-service's verify endpoint returns no
 *     tokens, so there is nothing to establish — and that is the point. On
 *     success the user goes back to login and passes the normal MFA_REQUIRED
 *     challenge on the existing two-factor screen. Enrolment cannot become a
 *     shortcut into the app.
 *
 *   • It never persists the enrolment token. It arrives as a route param, lives
 *     in this component, and goes in the body of the two calls that consume it.
 *     SecureStore holds access and refresh tokens; a five-minute credential that
 *     grants no roles does not belong beside them.
 *
 *   • It never logs the token, the secret or the otpauth URI.
 *
 * No QR code: the project has no QR encoder, and adding a dependency for one
 * would be the wrong trade here anyway — a phone cannot scan its own screen.
 * The otpauth:// URI opens the authenticator app directly instead, with the
 * secret shown for manual entry when no app handles the scheme.
 */
export default function MfaSetupScreen() {
  const { enrollmentToken, redirect } = useLocalSearchParams<{
    enrollmentToken?: string;
    redirect?: string;
  }>();

  const [setup, setSetup] = useState<EnrolmentSetup | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [secretShown, setSecretShown] = useState(false);
  // Guards a double-submit: the code is burned server-side on first use, so a
  // second in-flight request would fail with "already used".
  const submitting = useRef(false);

  const backToLogin = useCallback(
    (params?: Record<string, string>) => {
      router.replace({
        pathname: '/(auth)/login',
        params: { ...(redirect ? { redirect } : {}), ...params },
      });
    },
    [redirect],
  );

  const load = useCallback(async () => {
    if (!enrollmentToken) return;
    setLoading(true);
    setLoadError('');

    try {
      setSetup(await mfaApi.beginEnrolment(enrollmentToken));
    } catch (err) {
      // Distinguished because the recovery differs: an expired token means
      // signing in again, a 409 means the account is already set up, and a
      // network failure is worth retrying on the spot.
      let message = 'Could not start two-factor setup. Please try again.';
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data as { message?: string } | undefined;

        if (status === 401) {
          message = 'This setup session has expired. Please sign in again to restart it.';
        } else if (status === 409) {
          message =
            body?.message ??
            'Two-factor authentication is already enabled on this account. Please sign in again.';
        } else if (!err.response) {
          message = 'Cannot reach MUNI. Check your connection and try again.';
        } else if (body?.message) {
          message = body.message;
        }
      }
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [enrollmentToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reached by deep link, or after the token fell out of the navigation state.
  if (!enrollmentToken) {
    return (
      <AuthScreen heading="Setup session expired" subtitle="Please sign in again to continue.">
        <Button
          mode="contained"
          onPress={() => backToLogin()}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Back to sign in
        </Button>
      </AuthScreen>
    );
  }

  const openAuthenticator = async () => {
    if (!setup) return;
    try {
      await Linking.openURL(setup.otpauthUrl);
    } catch {
      // No app registered for otpauth:// — the manual secret below is the
      // fallback, so this is a nudge rather than a failure.
      setSubmitError(
        'No authenticator app responded. Add the setup key below to your app manually.',
      );
    }
  };

  const submit = async (value: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setVerifying(true);
    setSubmitError('');

    try {
      await mfaApi.completeEnrolment(enrollmentToken, value);

      // No session is created here, by design. Back to login, where this
      // account now takes the MFA_REQUIRED branch and the existing two-factor
      // screen finishes the job.
      backToLogin({ notice: 'enrolled' });
    } catch (err) {
      let message = 'Could not verify that code. Please try again.';
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data as
          | { message?: string; attemptsRemaining?: number }
          | undefined;

        if (status === 400 && body?.attemptsRemaining !== undefined) {
          message = `${body.message ?? 'Invalid code'} — ${body.attemptsRemaining} attempt${
            body.attemptsRemaining === 1 ? '' : 's'
          } left.`;
        } else if (status === 401) {
          message = 'This setup session has expired. Please sign in again to restart it.';
        } else if (status === 429) {
          message = body?.message ?? 'Too many attempts. Try again later.';
        } else if (!err.response) {
          message = 'Cannot reach MUNI. Check your connection and try again.';
        } else if (body?.message) {
          message = body.message;
        }
      }
      setSubmitError(message);
      setCode('');
    } finally {
      setVerifying(false);
      submitting.current = false;
    }
  };

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (submitError) setSubmitError('');
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  return (
    <AuthScreen
      heading="Set up two-factor authentication"
      subtitle="This account needs a second factor before it can sign in. It takes about a minute."
      error={submitError || loadError}
      footer={
        <TouchableOpacity
          onPress={() => backToLogin()}
          disabled={verifying}
          style={styles.cancel}
          accessibilityRole="link"
          accessibilityLabel="Cancel and sign in again"
        >
          <Text style={styles.linkText}>Cancel and sign in again</Text>
        </TouchableOpacity>
      }
    >
      {loading ? (
        <View style={styles.centre} accessibilityLabel="Loading setup information">
          <ActivityIndicator />
          <Text style={styles.muted}>Preparing your setup key…</Text>
        </View>
      ) : loadError && !setup ? (
        <Button
          mode="contained"
          onPress={() => void load()}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Try again
        </Button>
      ) : setup ? (
        <>
          <Text style={styles.step}>1. Add MUNI to your authenticator app</Text>
          <Button
            mode="contained-tonal"
            onPress={() => void openAuthenticator()}
            style={styles.button}
            contentStyle={styles.buttonContent}
            accessibilityLabel="Open my authenticator app"
          >
            Open authenticator app
          </Button>

          <Text style={styles.orText}>or add it by hand</Text>

          {/* Held back behind a tap rather than printed on arrival: this key is
              equivalent to the second factor itself, and setup often happens
              with someone else in the room. */}
          {secretShown ? (
            <View style={styles.secretBox}>
              <Text selectable style={styles.secret} accessibilityLabel="Setup key">
                {setup.secret}
              </Text>
            </View>
          ) : (
            <Button
              mode="outlined"
              onPress={() => setSecretShown(true)}
              style={styles.button}
              contentStyle={styles.buttonContent}
              accessibilityLabel="Show setup key"
            >
              Show setup key
            </Button>
          )}

          <Text style={styles.warning}>
            Anyone with this key can generate your codes. Do not share it or photograph it.
          </Text>

          <Text style={styles.step}>2. Enter the {CODE_LENGTH}-digit code it shows</Text>
          <CodeInput
            value={code}
            onChange={onChange}
            length={CODE_LENGTH}
            disabled={verifying}
            invalid={!!submitError}
          />

          <Button
            mode="contained"
            onPress={() => void submit(code)}
            loading={verifying}
            disabled={verifying || code.length !== CODE_LENGTH}
            style={styles.button}
            contentStyle={styles.buttonContent}
            accessibilityLabel={verifying ? 'Verifying' : 'Turn on two-factor authentication'}
          >
            {verifying ? 'Verifying…' : 'Turn on two-factor authentication'}
          </Button>

          <Text style={styles.muted}>
            You will sign in again once this is on, and enter a code from now on.
          </Text>
        </>
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: Spacing.lg, borderRadius: BorderRadius.full },
  buttonContent: { paddingVertical: Spacing.xs, minHeight: 48 },
  cancel: { alignItems: 'center', paddingVertical: Spacing.md, minHeight: 44 },
  linkText: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },
  centre: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  step: { marginTop: Spacing.lg, fontWeight: '700', fontSize: FontSize.sm, color: Colors.text.primary },
  orText: {
    marginTop: Spacing.md,
    textAlign: 'center',
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  secretBox: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
  },
  secret: {
    fontFamily: 'monospace',
    fontSize: FontSize.md,
    letterSpacing: 2,
    textAlign: 'center',
    color: Colors.text.primary,
  },
  warning: { marginTop: Spacing.sm, fontSize: FontSize.xs, color: Colors.text.muted },
  muted: { marginTop: Spacing.md, fontSize: FontSize.xs, color: Colors.text.muted, textAlign: 'center' },
});
