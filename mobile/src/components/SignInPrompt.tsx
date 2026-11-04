import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { promptSignIn } from '../utils/authRedirect';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';

interface SignInPromptProps {
  /** Route to return to once the user has signed in, e.g. `/(tabs)/cart`. */
  redirectTo: string;
  title?: string;
  message: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}

/**
 * What a signed-out shopper sees in place of a protected screen.
 *
 * Deliberately not a redirect: bouncing a browsing guest straight to a login
 * form hides the marketplace and loses their place. They stay on the tab they
 * tapped, see why an account is needed, and land back here after signing in.
 */
export function SignInPrompt({
  redirectTo,
  title = 'Sign in to continue',
  message,
  icon = 'account-circle-outline',
}: SignInPromptProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon} size={64} color={Colors.gray[400]} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => promptSignIn(redirectTo)}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        <Text style={styles.primaryText}>Sign in</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push({ pathname: '/(auth)/register', params: { redirect: redirectTo } })}
        accessibilityRole="button"
        accessibilityLabel="Create an account"
      >
        <Text style={styles.secondaryText}>Create an account</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.browseButton}
        onPress={() => router.push('/(tabs)')}
        accessibilityRole="button"
        accessibilityLabel="Keep browsing"
      >
        <Text style={styles.browseText}>Keep browsing</Text>
      </TouchableOpacity>

      {/* Legal notice. Placed below the actions rather than above them so it
          informs without competing with the primary task, which is the same
          order the Create account form uses.

          The links are nested <Text> inside a wrapping <Text> — that is what
          makes them tappable inline on React Native, where a <TouchableOpacity>
          cannot sit mid-sentence without breaking the line wrap. Each carries
          its own accessibilityRole so a screen reader announces two distinct
          links rather than one paragraph. */}
      <Text style={styles.legal}>
        By continuing, you agree to our{' '}
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/terms')}
          accessibilityRole="link"
          accessibilityLabel="Terms and Conditions"
        >
          Terms &amp; Conditions
        </Text>
        {' '}and{' '}
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/privacy')}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.background.primary,
  },
  icon: { marginBottom: Spacing.md },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.md,
    color: Colors.text.muted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    minWidth: 220,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: Colors.text.onAccent, fontSize: FontSize.md, fontWeight: '700' },
  secondaryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 220,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '600' },
  browseButton: { marginTop: Spacing.lg, padding: Spacing.sm },
  browseText: { color: Colors.link, fontSize: FontSize.sm, fontWeight: '600' },
  legal: {
    marginTop: Spacing.xl,
    // Kept inside the 220pt button column so the sentence wraps to the same
    // measure as the actions above rather than running the full screen width.
    maxWidth: 300,
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: { color: Colors.link, fontWeight: '600' },
});
