import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import { authApi } from '@/api/auth.api';
import { resolveRedirect } from '@/utils/authRedirect';
import { AuthScreen } from '@/components/AuthScreen';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  // Carried in from login so finishing recovery returns the shopper to whatever
  // they were originally trying to reach, not to a bare login screen.
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const destination = resolveRedirect(redirect);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const backToSignIn = () =>
    router.replace({ pathname: '/(auth)/login', params: { redirect: destination } });

  /**
   * The success copy is deliberately the same whether or not the address has an
   * account — telling the difference would let anyone test which emails are
   * registered. Only a transport-level failure is reported as an error.
   */
  const handleReset = async () => {
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.forgotPassword(trimmed);
      setSuccess(true);
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        setError('Cannot reach MUNI. Check your connection and try again.');
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
      } else {
        setError('Could not send the reset link. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthScreen
        heading="Check your email"
        subtitle={`If an account exists for ${email.trim()}, we've sent a link to reset your password.`}
      >

        {/* The email carries a one-time code, so the next step is entering it.
            Before this screen existed the flow stopped here and the code had
            nowhere to go. */}
        <Button
          mode="contained"
          onPress={() =>
            router.push({
              pathname: '/(auth)/reset-password',
              params: { email: email.trim(), redirect: destination },
            })
          }
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Enter code
        </Button>

        {/* Sending again is the same real endpoint, not a separate "resend"
            route — auth-service has none, so this simply repeats the request. */}
        <TouchableOpacity
          onPress={() => void handleReset()}
          disabled={loading}
          style={styles.secondaryAction}
          accessibilityRole="button"
          accessibilityLabel="Send the email again"
        >
          <Text style={styles.linkText}>{loading ? 'Sending…' : 'Send it again'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={backToSignIn}
          disabled={loading}
          style={styles.secondaryAction}
          accessibilityRole="link"
          accessibilityLabel="Back to sign in"
        >
          <Text style={styles.linkText}>Back to sign in</Text>
        </TouchableOpacity>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      heading="Reset your password"
      subtitle="Enter the email on your account and we'll send you a reset link."
      error={error}
      footer={
        <TouchableOpacity
          onPress={backToSignIn}
          disabled={loading}
          style={styles.secondaryAction}
          accessibilityRole="link"
          accessibilityLabel="Back to sign in"
        >
          <Text style={styles.linkText}>Back to sign in</Text>
        </TouchableOpacity>
      }
    >
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
        editable={!loading}
        left={<TextInput.Icon icon="email-outline" />}
        onSubmitEditing={() => void handleReset()}
        returnKeyType="send"
      />

      <Button
        mode="contained"
        onPress={handleReset}
        loading={loading}
        disabled={loading}
        style={styles.button}
        contentStyle={styles.buttonContent}
        accessibilityLabel={loading ? 'Sending reset link' : 'Send reset link'}
      >
        {loading ? 'Sending…' : 'Send reset link'}
      </Button>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: Spacing.lg, backgroundColor: Colors.background.card },
  button: { borderRadius: BorderRadius.full },
  buttonContent: { paddingVertical: Spacing.xs, minHeight: 48 },
  successBlock: { alignItems: 'center', marginBottom: Spacing.lg },
  successTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  successText: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  secondaryAction: { alignItems: 'center', paddingVertical: Spacing.md, minHeight: 44 },
  linkText: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },
});
