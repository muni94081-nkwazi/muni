import React, { useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { authApi } from '@/api/auth.api';
import { establishSessionThunk } from '@/store/auth.slice';
import type { AppDispatch } from '@/store';
import { resolveRedirect } from '@/utils/authRedirect';
import { AuthScreen } from '@/components/AuthScreen';
import { CodeInput } from '@/components/CodeInput';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

const CODE_LENGTH = 6;

/**
 * Second leg of an MFA login.
 *
 * Reached from login.tsx when auth-service answers MFA_REQUIRED — which it does
 * for ROLE_ADMIN, ROLE_SUPER_ADMIN and ROLE_SELLER accounts. A plain customer
 * never lands here.
 *
 * The `challengeToken` carries no roles and is only accepted by
 * /auth/2fa/authenticate, so passing it as a route param is not a token leak in
 * the way an access token would be. It is short-lived; an expired one comes
 * back as a 401 and the only recovery is signing in again.
 */
export default function TwoFactorScreen() {
  const { challengeToken, redirect } = useLocalSearchParams<{
    challengeToken?: string;
    redirect?: string;
  }>();
  // Carried through from login so an MFA account also lands back on whatever it
  // was trying to do, not on Home.
  const destination = resolveRedirect(redirect);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dispatch = useDispatch<AppDispatch>();
  // Guards against a double-submit firing two verifications: the code is burned
  // server-side on first use, so the second would fail with "already used".
  const submitting = useRef(false);

  // Enrolment has its own screen now — app/(auth)/mfa-setup.tsx — and login
  // routes MFA_ENROLLMENT_REQUIRED straight there. This screen used to catch
  // that branch only to say enrolment was not supported on mobile, which left
  // privileged accounts unable to sign in at all.
  if (!challengeToken) {
    return (
      <AuthScreen heading="Session expired" subtitle="Please sign in again to continue.">
        <Button
          mode="contained"
          onPress={() => router.replace('/(auth)/login')}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Back to sign in
        </Button>
      </AuthScreen>
    );
  }

  const submit = async (value: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError('');

    try {
      const session = await authApi.authenticate2FA(challengeToken, value);
      await dispatch(establishSessionThunk(session)).unwrap();
      router.replace(destination as never);
    } catch (err) {
      // auth-service distinguishes these, and the difference matters: a wrong
      // code is worth retrying, an expired challenge is not.
      let message = 'Could not verify that code. Please try again.';
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data as
          | { message?: string; attemptsRemaining?: number }
          | undefined;

        if (status === 401 && body?.attemptsRemaining !== undefined) {
          message = `${body.message ?? 'Invalid code'} — ${body.attemptsRemaining} attempt${
            body.attemptsRemaining === 1 ? '' : 's'
          } left.`;
        } else if (status === 401) {
          message = body?.message ?? 'That challenge has expired — please sign in again.';
        } else if (status === 429) {
          message = body?.message ?? 'Too many attempts. Try again later.';
        } else if (body?.message) {
          message = body.message;
        }
      }
      setError(message);
      setCode('');
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  const onChange = (raw: string) => {
    // TOTP codes are always six digits; stripping non-digits keeps a numeric
    // keypad's stray characters (and a pasted "123 456") from reaching the API.
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError('');
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  return (
    <AuthScreen
      heading="Verify it's you"
      subtitle={`Enter the ${CODE_LENGTH}-digit code from your authenticator app.`}
      error={error}
      footer={
        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          disabled={loading}
          style={styles.cancel}
          accessibilityRole="link"
          accessibilityLabel="Cancel and sign in again"
        >
          <Text style={styles.linkText}>Cancel and sign in again</Text>
        </TouchableOpacity>
      }
    >
      {/* Six boxes rather than one field: the code is fixed-length, and
          per-digit boxes make position obvious while typing. `onChange` keeps
          its auto-submit on the sixth digit, and the submitting ref still
          guards the double fire. */}
      <CodeInput
        value={code}
        onChange={onChange}
        length={CODE_LENGTH}
        disabled={loading}
        invalid={!!error}
      />

      <Button
        mode="contained"
        onPress={() => void submit(code)}
        loading={loading}
        disabled={loading || code.length !== CODE_LENGTH}
        style={styles.button}
        contentStyle={styles.buttonContent}
        accessibilityLabel={loading ? 'Verifying' : 'Verify'}
      >
        {loading ? 'Verifying…' : 'Verify'}
      </Button>

      {/* No resend: auth-service has no endpoint to reissue a TOTP challenge —
          the code comes from the shopper's own authenticator app. */}
    </AuthScreen>
  );
}

// The shell owns the page, heading and error banner — see AuthScreen.
const styles = StyleSheet.create({
  button: { marginTop: Spacing.lg, borderRadius: BorderRadius.full },
  buttonContent: { paddingVertical: Spacing.xs, minHeight: 48 },
  cancel: { alignItems: 'center', paddingVertical: Spacing.md, minHeight: 44 },
  linkText: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },
});
