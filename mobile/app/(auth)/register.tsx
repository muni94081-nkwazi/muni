import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import { authApi } from '@/api/auth.api';
import { establishSessionThunk } from '@/store/auth.slice';
import type { AppDispatch } from '@/store';
import { resolveRedirect } from '@/utils/authRedirect';
import { PASSWORD_RULES, passwordPolicySummary } from '@/utils/passwordPolicy';
import { AuthScreen } from '@/components/AuthScreen';
import { SocialSignIn } from '@/components/SocialSignIn';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks worth doing before spending a round-trip. auth-service validates all
 * of this itself and stays authoritative — this only saves the user a failed
 * request and points at the field that needs fixing.
 */
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.firstName.trim()) errors.firstName = 'Enter your first name';
  if (!form.lastName.trim()) errors.lastName = 'Enter your last name';
  if (!form.email.trim()) errors.email = 'Enter your email';
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (!form.phoneNumber.trim()) errors.phoneNumber = 'Enter your phone number';
  if (!form.password) errors.password = 'Choose a password';
  else {
    // The server's own policy, not a looser local guess: it asked for 8
    // characters here while auth-service rejects anything under 12 that is not
    // mixed case with a number and a symbol, so a password this form accepted
    // came back a 422.
    const summary = passwordPolicySummary(form.password);
    if (summary) errors.password = summary;
  }
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export default function RegisterScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

  const destination = resolveRedirect(redirect);

  const set = (field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  /**
   * POST /auth/register answers with a full session (bare, not enveloped — see
   * src/api/auth.api.ts), so a new account is signed in immediately through the
   * same thunk login uses. This screen used to fake the whole thing with a
   * setTimeout and drop the user into the tabs with no session at all.
   */
  const handleRegister = async () => {
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await authApi.register(
        form.firstName.trim(),
        form.lastName.trim(),
        form.email.trim(),
        form.phoneNumber.trim(),
        form.password,
      );
      await dispatch(establishSessionThunk(session)).unwrap();
      router.replace(destination as never);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { message?: string } | undefined;
        if (err.response?.status === 409) {
          setError(body?.message ?? 'An account with that email already exists.');
        } else if (!err.response) {
          setError('Cannot reach MUNI. Check your connection and try again.');
        } else {
          setError(body?.message ?? 'Could not create your account. Please try again.');
        }
      } else {
        setError('Could not create your account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      heading="Create an account"
      error={error}
      footer={
        <View style={styles.loginRow}>
          <Text style={styles.muted}>Already have an account? </Text>
          <TouchableOpacity
            onPress={() =>
              router.replace({ pathname: '/(auth)/login', params: { redirect: destination } })
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel="Sign in"
          >
            <Text style={styles.linkText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextInput
              label="First name"
              value={form.firstName}
              onChangeText={set('firstName')}
              mode="outlined"
              style={styles.input}
              error={!!fieldErrors.firstName}
              editable={!loading}
              autoComplete="given-name"
            />
            <FieldError message={fieldErrors.firstName} />
          </View>
          <View style={styles.rowItem}>
            <TextInput
              label="Last name"
              value={form.lastName}
              onChangeText={set('lastName')}
              mode="outlined"
              style={styles.input}
              error={!!fieldErrors.lastName}
              editable={!loading}
              autoComplete="family-name"
            />
            <FieldError message={fieldErrors.lastName} />
          </View>
        </View>

        <TextInput
          label="Email"
          value={form.email}
          onChangeText={set('email')}
          mode="outlined"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          error={!!fieldErrors.email}
          editable={!loading}
          left={<TextInput.Icon icon="email-outline" />}
        />
        <FieldError message={fieldErrors.email} />

        <TextInput
          label="Phone number"
          value={form.phoneNumber}
          onChangeText={set('phoneNumber')}
          mode="outlined"
          style={styles.input}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          error={!!fieldErrors.phoneNumber}
          editable={!loading}
          left={<TextInput.Icon icon="phone-outline" />}
        />
        <FieldError message={fieldErrors.phoneNumber} />

        <TextInput
          label="Password"
          value={form.password}
          onChangeText={set('password')}
          mode="outlined"
          style={styles.input}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          error={!!fieldErrors.password}
          editable={!loading}
          left={<TextInput.Icon icon="lock-outline" />}
          right={
            <TextInput.Icon
              icon={showPassword ? 'eye-off' : 'eye'}
              onPress={() => setShowPassword(!showPassword)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            />
          }
        />
        {/* The requirements are shown as they are met rather than as one
            error after submitting, because the server's policy is strict
            enough that guessing it costs several attempts. */}
        <View style={styles.policy} accessibilityLabel="Password requirements">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(form.password);
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

        <TextInput
          label="Confirm password"
          value={form.confirmPassword}
          onChangeText={set('confirmPassword')}
          mode="outlined"
          style={styles.input}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          error={!!fieldErrors.confirmPassword}
          editable={!loading}
          left={<TextInput.Icon icon="lock-check-outline" />}
        />
        <FieldError message={fieldErrors.confirmPassword} />

      {/* The consent is stated at the point of action rather than gated behind
          a checkbox. That is unchanged and deliberate — the button label is the
          consent, so there is no separate box whose unticked state blocks a
          submission the user has already asked for.

          What has changed is that the documents are now reachable: /terms and
          /privacy exist, so the note above about "a link to a page that does
          not exist is worse than none" no longer applies. Consent to terms
          nobody can read is not meaningful consent.

          Nested <Text> rather than TouchableOpacity so the links sit inline and
          the sentence still wraps correctly. */}
      <Text style={styles.agreement}>
        By selecting Create account, you agree to the MUNI{' '}
        <Text
          style={styles.agreementLink}
          onPress={() => router.push('/terms')}
          accessibilityRole="link"
          accessibilityLabel="Terms and Conditions"
        >
          Terms &amp; Conditions
        </Text>
        {' '}and acknowledge the MUNI{' '}
        <Text
          style={styles.agreementLink}
          onPress={() => router.push('/privacy')}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
        >
          Privacy Policy
        </Text>
        .
      </Text>

      <Button
        mode="contained"
        onPress={handleRegister}
        loading={loading}
        disabled={loading}
        style={styles.button}
        contentStyle={styles.buttonContent}
        accessibilityLabel={loading ? 'Creating account' : 'Create account'}
      >
        {loading ? 'Creating account…' : 'Create account'}
      </Button>

      {/* Renders nothing unless auth-service reports a configured provider. */}
      <SocialSignIn variant="row" redirectTo={destination} />
    </AuthScreen>
  );
}

function FieldError({ message, muted = false }: { message?: string; muted?: boolean }) {
  if (!message) return null;
  return <Text style={[styles.fieldError, muted && styles.fieldHint]}>{message}</Text>;
}

const styles = StyleSheet.create({
  agreement: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  agreementLink: { color: Colors.link, fontWeight: '600' },
  policy: { marginTop: Spacing.xs, marginBottom: Spacing.sm, paddingHorizontal: Spacing.xs },
  policyRow: { flexDirection: 'row', alignItems: 'center', minHeight: 20 },
  policyText: { fontSize: FontSize.xs, color: Colors.text.muted, marginLeft: 4 },
  policyTextMet: { color: Colors.success },
  container: { flex: 1, backgroundColor: Colors.background.primary },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  brandBlock: { marginBottom: Spacing.lg },
  brand: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text.primary },
  tagline: { fontSize: FontSize.sm, color: Colors.text.muted, marginTop: Spacing.xs },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.error}14`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, marginLeft: Spacing.sm, flex: 1, fontSize: FontSize.sm },
  row: { flexDirection: 'row', marginHorizontal: -Spacing.xs },
  rowItem: { flex: 1, paddingHorizontal: Spacing.xs },
  input: { marginBottom: Spacing.xs, backgroundColor: Colors.background.card },
  fieldError: { color: Colors.error, fontSize: FontSize.xs, marginBottom: Spacing.sm, marginLeft: Spacing.xs },
  fieldHint: { color: Colors.text.muted },
  button: { marginBottom: Spacing.md, borderRadius: BorderRadius.full },
  buttonContent: { paddingVertical: Spacing.xs, minHeight: 48 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  muted: { color: Colors.text.muted, fontSize: FontSize.sm },
  linkText: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },
});
