import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import { authApi } from '@/api/auth.api';
import { resolveRedirect } from '@/utils/authRedirect';
import { PASSWORD_RULES, passwordPolicySummary } from '@/utils/passwordPolicy';
import { AuthScreen } from '@/components/AuthScreen';
import { CodeInput } from '@/components/CodeInput';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

const CODE_LENGTH = 6;

/**
 * The second half of a password reset: the code from the email, plus the new
 * password.
 *
 * This screen did not exist. forgot-password asked auth-service to send a
 * one-time code and there was nowhere in the app to enter it, so a shopper who
 * started a reset on mobile could not finish one — the email was a dead end.
 * The client for the endpoint was broken too, sending `{ token, password }`
 * where the service reads `{ email, otp, newPassword }`.
 *
 * Nothing new is added on the server: this is `POST /auth/reset-password`,
 * exactly as it already exists.
 */
export default function ResetPasswordScreen() {
  // The address the code was sent to, handed over by forgot-password so it does
  // not have to be typed twice.
  const { email: emailParam, redirect } = useLocalSearchParams<{
    email?: string;
    redirect?: string;
  }>();
  const destination = resolveRedirect(redirect);

  const [email, setEmail] = useState(emailParam ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const toSignIn = () =>
    router.replace({ pathname: '/(auth)/login', params: { redirect: destination } });

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter the email you requested the code for.');
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from your email.`);
      return;
    }
    // The same policy the server enforces, so a weak password is caught here
    // rather than costing a round trip and burning the one-time code.
    const summary = passwordPolicySummary(password);
    if (summary) {
      setError(summary);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.resetPassword(email.trim(), code, password);
      setDone(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data as { message?: string } | undefined;
        if (status === 400 || status === 401) {
          setError(body?.message ?? 'That code is incorrect or has expired. Request a new one.');
        } else if (status === 422) {
          setError(body?.message ?? 'That password does not meet the requirements.');
        } else if (!err.response) {
          setError('Cannot reach MUNI. Check your connection and try again.');
        } else {
          setError('Could not reset your password. Please try again.');
        }
      } else {
        setError('Could not reset your password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthScreen
        heading="Password updated"
        subtitle="You can now sign in with your new password."
      >
        <Button
          mode="contained"
          onPress={toSignIn}
          style={styles.primary}
          contentStyle={styles.primaryContent}
        >
          Sign in
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      heading="Choose a new password"
      subtitle={`Enter the ${CODE_LENGTH}-digit code we sent you, then pick a new password.`}
      error={error}
      footer={
        <TouchableOpacity
          onPress={toSignIn}
          disabled={loading}
          style={styles.secondary}
          accessibilityRole="link"
          accessibilityLabel="Back to sign in"
        >
          <Text style={styles.link}>Back to sign in</Text>
        </TouchableOpacity>
      }
    >
      {/* Prefilled from the previous screen, but editable: the code is tied to
          an address, and getting here from a cold start needs it typed. */}
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        mode="outlined"
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!loading}
      />

      <Text style={styles.label}>Verification code</Text>
      <CodeInput
        value={code}
        onChange={(next) => {
          setCode(next);
          if (error) setError('');
        }}
        length={CODE_LENGTH}
        disabled={loading}
        invalid={!!error && code.length === CODE_LENGTH}
      />

      <TextInput
        label="New password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (error) setError('');
        }}
        mode="outlined"
        style={[styles.input, styles.passwordInput]}
        secureTextEntry={!showPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        right={
          <TextInput.Icon
            icon={showPassword ? 'eye-off' : 'eye'}
            onPress={() => setShowPassword(!showPassword)}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          />
        }
      />

      <View style={styles.policy} accessibilityLabel="Password requirements">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <View key={rule.id} style={styles.policyRow}>
              <MaterialCommunityIcons
                name={met ? 'check-circle' : 'circle-small'}
                size={met ? 14 : 18}
                color={met ? Colors.success : Colors.text.muted}
              />
              <Text style={[styles.policyText, met && styles.policyTextMet]}>{rule.label}</Text>
            </View>
          );
        })}
      </View>

      <Button
        mode="contained"
        onPress={handleReset}
        loading={loading}
        disabled={loading}
        style={styles.primary}
        contentStyle={styles.primaryContent}
        accessibilityLabel={loading ? 'Updating password' : 'Update password'}
      >
        {loading ? 'Updating…' : 'Update password'}
      </Button>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: Spacing.md, backgroundColor: Colors.white },
  passwordInput: { marginTop: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
  },
  policy: { marginBottom: Spacing.md },
  policyRow: { flexDirection: 'row', alignItems: 'center', minHeight: 20 },
  policyText: { fontSize: FontSize.xs, color: Colors.text.muted, marginLeft: 4 },
  policyTextMet: { color: Colors.success },
  primary: { borderRadius: BorderRadius.full },
  primaryContent: { paddingVertical: Spacing.xs, minHeight: 48 },
  secondary: { alignItems: 'center', paddingVertical: Spacing.md, minHeight: 44 },
  link: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },
});
