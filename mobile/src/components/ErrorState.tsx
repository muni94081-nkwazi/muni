import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';

interface ErrorStateProps {
  /** Plain-language message. Callers pass the slice/thunk message, never a raw stack. */
  message?: string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  style?: ViewStyle;
}

export function ErrorState({
  message,
  title = 'Something went wrong',
  onRetry,
  retryLabel = 'Try again',
  compact = false,
  style,
}: ErrorStateProps) {
  return (
    <View style={[compact ? styles.compact : styles.container, style]}>
      <MaterialCommunityIcons
        name="wifi-off"
        size={compact ? 32 : 48}
        color={Colors.gray[400]}
        style={styles.icon}
      />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {onRetry ? (
        <TouchableOpacity
          style={styles.button}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <MaterialCommunityIcons name="refresh" size={18} color={Colors.text.onAccent} />
          <Text style={styles.buttonText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // See the note in EmptyState: this also renders inside list content
    // containers, where flex alone leaves it with no height.
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  compact: { alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg },
  icon: { marginBottom: Spacing.md },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.text.muted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    minHeight: 44,
  },
  buttonText: {
    color: Colors.text.onAccent,
    fontSize: FontSize.md,
    fontWeight: '700',
    marginLeft: Spacing.xs,
  },
});
