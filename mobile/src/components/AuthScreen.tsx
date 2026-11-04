import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  type ViewStyle,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';

interface AuthScreenProps {
  /** The page heading, set large under the wordmark — "Sign in to your account". */
  heading: string;
  /** One line of explanation under the heading, where a screen needs it. */
  subtitle?: string;
  /** A user-facing error; the banner is hidden when empty. */
  error?: string;
  children: React.ReactNode;
  /** Sits below the card — register prompts, guest browsing, back links. */
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
}

/**
 * The shell every authentication screen sits in.
 *
 * Login, register, forgot-password and two-factor each re-implemented the same
 * scaffold — KeyboardAvoidingView, a scroll container, the top inset, the MUNI
 * wordmark, an error banner — with small differences in spacing and inset
 * handling that made the four screens read as four designs. This is that
 * scaffold once.
 *
 * The keyboard handling is the part worth not duplicating: iOS needs `padding`
 * behaviour while Android's adjustResize already does the work, and the scroll
 * container is what stops the submit button hiding under the keyboard on a
 * short screen. `keyboardShouldPersistTaps="handled"` keeps the first tap on a
 * link working while the keyboard is open, instead of it only dismissing.
 */
export function AuthScreen({
  heading,
  subtitle,
  error,
  children,
  footer,
  contentStyle,
}: AuthScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // Top inset for the notch/Dynamic Island, bottom for the home
          // indicator — the scroll view has no safe-area behaviour of its own.
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.form}>
        <Text style={styles.brand}>MUNI</Text>
        <Text style={styles.heading}>{heading}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        {/* Occupies no space until there is something to say — an empty banner
            reserved on every fresh screen reads as a warning before the shopper
            has done anything. */}
        {error ? (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.body}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// A plain page, not a card on a tinted ground: the reference puts the form
// directly on the background, and a card here only adds a frame to look past.
// Flat and centred on white, with a measure narrow enough to stay readable on a
// tablet. The 360 cap and the 48/24/32 rhythm come from the design spec; the
// colours are MUNI's own tokens, since the palette is not ours to restyle.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 48,
    justifyContent: 'center',
  },
  /** Caps the measure on tablets while filling a phone minus its padding. */
  form: { width: '100%', maxWidth: 460, alignSelf: 'center' },

  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 1,
    marginBottom: 24,
  },
  // Left-aligned and set large: the reference leads with the heading rather
  // than centring it over the form.
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 8,
    lineHeight: 20,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.error}14`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, marginLeft: Spacing.sm, flex: 1, fontSize: FontSize.sm },

  /** The gap the spec puts between the heading block and the first field. */
  body: { marginTop: 24 },
  footer: { marginTop: 32, alignItems: 'center' },
});
