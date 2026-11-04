import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

/**
 * Tint applied to a semantic colour to make the pill background.
 *
 * The badge keeps its original shape — coloured text on a matching pale fill —
 * but both halves now derive from one token instead of a hand-picked pair, so
 * the statuses stay in step with the palette. `1A` is ~10% alpha; React Native
 * accepts 8-digit #RRGGBBAA.
 */
const TINT = '1A';

/**
 * Every member of the `OrderStatus` union in src/types, so no real order falls
 * through to the neutral grey default. Anything not listed here is a status the
 * API does not send.
 */
const STATUS_COLORS: Record<string, string> = {
  PENDING: Colors.warning,
  CONFIRMED: Colors.link,
  PROCESSING: Colors.link,
  SHIPPED: Colors.info,
  OUT_FOR_DELIVERY: Colors.primaryDark,
  DELIVERED: Colors.success,
  CANCELLED: Colors.error,
  REFUNDED: Colors.gray[600],
};

/** `OUT_FOR_DELIVERY` reads badly in a pill; show the words instead. */
function label(status: string): string {
  return status.replace(/_/g, ' ');
}

export function StatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const key = status.toUpperCase();
  const textColor = STATUS_COLORS[key] ?? Colors.text.muted;
  const bgColor = STATUS_COLORS[key] ? `${STATUS_COLORS[key]}${TINT}` : Colors.gray[100];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 6 : 8,
        },
      ]}
    >
      <Text style={[styles.text, { color: textColor, fontSize: size === 'sm' ? 10 : 12 }]}>
        {label(key)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, alignSelf: 'flex-start' },
  text: { fontWeight: 'bold' },
});
