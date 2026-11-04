import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { authApi } from '@/api/auth.api';
import { establishSessionThunk } from '@/store/auth.slice';
import type { AppDispatch } from '@/store';
import { resolveRedirect } from '@/utils/authRedirect';
import { AuthScreen } from '@/components/AuthScreen';
import { SocialSignIn } from '@/components/SocialSignIn';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in, in two steps: identify yourself, then prove it.
 *
 * The screen previously asked for email and password together. Splitting them
 * puts one decision on screen at a time and gives the social options a place to
 * live — they are only an alternative to typing a password, so they belong on
 * the first step and disappear once the shopper has committed to the password
 * route. customer-web already worked this way; mobile did not, and the two
 * looked like different products.
 *
 * Only the presentation is staged. There is no "does this email exist" call —
 * auth-service has no such endpoint, and adding a client-side probe for one
 * would leak which addresses are registered. `Continue` just validates the
 * address locally and reveals the password field; the single real
 * `POST /auth/login` still carries both values.
 */
export default function LoginScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordStep, setPasswordStep] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dispatch = useDispatch<AppDispatch>();

  // Where the shopper was heading before they hit a protected action. Carried
  // through the MFA leg and the register link so it survives the whole flow.
  const destination = resolveRedirect(redirect);

  const goToRegister = () =>
    router.push({ pathname: '/(auth)/register', params: { redirect: destination } });

  /** Step one: local format check only, then reveal the password field. */
  const handleContinue = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email to continue.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setPasswordStep(true);
  };

  /**
   * POST /auth/login has three successful outcomes, not one. Two of them carry
   * no tokens, so they must be routed rather than treated as failures:
   *
   *   AUTHENTICATED            → session starts here
   *   MFA_REQUIRED             → second factor, on /two-factor
   *   MFA_ENROLLMENT_REQUIRED  → privileged account with no factor enrolled yet
   *
   * The response is NOT enveloped — see the note in src/api/auth.api.ts.
   */
  const handleLogin = async () => {
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await authApi.login(email.trim(), password);

      if (result.status === 'MFA_REQUIRED') {
        router.push({
          pathname: '/(auth)/two-factor',
          params: { challengeToken: result.challengeToken, redirect: destination },
        });
        return;
      }

      if (result.status === 'MFA_ENROLLMENT_REQUIRED') {
        router.push({
          pathname: '/(auth)/mfa-setup',
          params: { enrollmentToken: result.enrollmentToken, redirect: destination },
        });
        return;
      }

      await dispatch(establishSessionThunk(result)).unwrap();
      router.replace(destination as never);
    } catch (err) {
      // 401 is a wrong password; anything else is worth distinguishing so the
      // user is not told "wrong password" when the API is simply unreachable.
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { message?: string } | undefined;
        if (err.response?.status === 401) {
          setError(body?.message ?? 'Incorrect email or password.');
        } else if (!err.response) {
          setError('Cannot reach MUNI. Check your connection and try again.');
        } else {
          setError(body?.message ?? 'Something went wrong. Please try again.');
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      heading="Sign in to your account"
      error={error}
      footer={
        // Browsing signed-out is deliberately quieter than the sign-in path:
        // available, but not competing with the primary action.
        <TouchableOpacity
          style={styles.browse}
          onPress={() => router.replace('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Continue browsing without signing in"
        >
          <Text style={styles.browseText}>Continue browsing without signing in</Text>
        </TouchableOpacity>
      }
    >
      {/* Registration sits above the form, not buried under it: someone without
          an account should find that out before typing anything. */}
      <View style={styles.newHere}>
        <Text style={styles.newHereText}>New to MUNI?</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={goToRegister}
          accessibilityRole="button"
          accessibilityLabel="Create an account"
        >
          <Text style={styles.createButtonText}>Create account</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        label="Email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error) setError('');
        }}
        mode="outlined"
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading && !passwordStep}
        // Once past step one the address is settled; changing it re-opens step
        // one rather than silently signing in as someone else.
        right={
          passwordStep ? (
            <TextInput.Icon
              icon="pencil-outline"
              onPress={() => {
                setPasswordStep(false);
                setPassword('');
                setError('');
              }}
              accessibilityLabel="Change email"
            />
          ) : undefined
        }
        onSubmitEditing={handleContinue}
        returnKeyType="next"
      />

      {passwordStep && (
        <TextInput
          label="Password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (error) setError('');
          }}
          mode="outlined"
          style={styles.input}
          secureTextEntry={!showPassword}
          autoComplete="password"
          textContentType="password"
          editable={!loading}
          autoFocus
          right={
            <TextInput.Icon
              icon={showPassword ? 'eye-off' : 'eye'}
              onPress={() => setShowPassword(!showPassword)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            />
          }
          onSubmitEditing={() => void handleLogin()}
          returnKeyType="go"
        />
      )}

      <Button
        mode="contained"
        onPress={passwordStep ? handleLogin : handleContinue}
        loading={loading}
        disabled={loading}
        style={styles.primary}
        contentStyle={styles.primaryContent}
        accessibilityLabel={passwordStep ? 'Sign in' : 'Continue'}
      >
        {loading ? 'Signing in…' : passwordStep ? 'Sign in' : 'Continue'}
      </Button>

      {passwordStep && (
        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: '/(auth)/forgot-password', params: { redirect: destination } })
          }
          style={styles.forgot}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="link"
          accessibilityLabel="Forgot password"
        >
          <Text style={styles.linkText}>Forgot password?</Text>
        </TouchableOpacity>
      )}

      {/* An alternative to typing a password, so it belongs to step one only.
          Renders nothing unless auth-service reports a configured provider. */}
      {!passwordStep && <SocialSignIn redirectTo={destination} />}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  newHere: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  newHereText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary },
  createButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    minHeight: 40,
    justifyContent: 'center',
  },
  createButtonText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.primary },

  input: { marginBottom: Spacing.md, backgroundColor: Colors.background.card },
  primary: { borderRadius: BorderRadius.full },
  primaryContent: { paddingVertical: Spacing.xs, minHeight: 48 },
  forgot: { alignItems: 'center', paddingVertical: Spacing.md, minHeight: 44 },
  linkText: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },

  browse: { alignItems: 'center', padding: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  browseText: { color: Colors.text.muted, fontSize: FontSize.sm, fontWeight: '600' },
});
