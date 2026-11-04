import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';

/**
 * Tax invoices and VAT details.
 *
 * tax-service is real and the gateway exposes `auth('/tax/invoices')` plus
 * `pub('/tax/rates')`, but no mobile screen consumes either yet. Orders already
 * show what was charged, so that is where this points in the meantime.
 */
export default function TaxScreen() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon="receipt-text-outline"
        title="No tax documents"
        subtitle="Tax invoices are not available in the app yet. The tax charged on a purchase is shown on the order itself."
        actionLabel="View my orders"
        onAction={() => router.push('/(tabs)/orders')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
});
