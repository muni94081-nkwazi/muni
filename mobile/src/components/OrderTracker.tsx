import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import type { OrderStatus } from '../types';

/**
 * The fulfilment path an order walks, in order. These are the real
 * `OrderStatus` members — the tracker marks a stage as reached by the order's
 * current status alone, and never invents a date for a step the API has not
 * reported.
 */
const STAGES: Array<{ status: OrderStatus; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { status: 'PENDING', label: 'Order placed', icon: 'receipt' },
  { status: 'PROCESSING', label: 'Processing', icon: 'package-variant-closed' },
  { status: 'SHIPPED', label: 'Shipped', icon: 'truck-outline' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery', icon: 'moped-outline' },
  { status: 'DELIVERED', label: 'Delivered', icon: 'check-circle-outline' },
];

/** CONFIRMED sits between PENDING and PROCESSING and shares the processing step. */
const STAGE_INDEX: Partial<Record<OrderStatus, number>> = {
  PENDING: 0,
  CONFIRMED: 1,
  PROCESSING: 1,
  SHIPPED: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

interface OrderTrackerProps {
  status: OrderStatus;
  /** Shown against the first stage — the only step whose time the API reports. */
  placedAt?: string;
  estimatedDelivery?: string;
}

export function OrderTracker({ status, placedAt, estimatedDelivery }: OrderTrackerProps) {
  // A cancelled or refunded order never walks the rest of the path, so drawing
  // the ladder would misrepresent where it stopped.
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    return (
      <View style={styles.terminal}>
        <MaterialCommunityIcons
          name={status === 'REFUNDED' ? 'cash-refund' : 'close-circle-outline'}
          size={22}
          color={status === 'REFUNDED' ? Colors.gray[600] : Colors.error}
        />
        <Text style={styles.terminalText}>
          {status === 'REFUNDED' ? 'This order was refunded.' : 'This order was cancelled.'}
        </Text>
      </View>
    );
  }

  const current = STAGE_INDEX[status] ?? 0;

  return (
    <View style={styles.container}>
      {STAGES.map((stage, index) => {
        const reached = index <= current;
        const isCurrent = index === current;
        const isLast = index === STAGES.length - 1;

        return (
          <View key={stage.status} style={styles.row}>
            <View style={styles.railColumn}>
              <View style={[styles.node, reached && styles.nodeReached, isCurrent && styles.nodeCurrent]}>
                <MaterialCommunityIcons
                  name={stage.icon}
                  size={16}
                  color={reached ? Colors.text.onAccent : Colors.gray[500]}
                />
              </View>
              {!isLast ? <View style={[styles.connector, index < current && styles.connectorReached]} /> : null}
            </View>

            <View style={styles.labelColumn}>
              <Text style={[styles.label, reached && styles.labelReached]}>{stage.label}</Text>
              {index === 0 && placedAt ? <Text style={styles.timestamp}>{placedAt}</Text> : null}
              {isLast && !reached && estimatedDelivery ? (
                <Text style={styles.timestamp}>Estimated {estimatedDelivery}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: Spacing.xs },
  row: { flexDirection: 'row' },
  railColumn: { alignItems: 'center', width: 40 },
  node: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.alt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeReached: { backgroundColor: Colors.primary },
  nodeCurrent: { borderWidth: 2, borderColor: Colors.primaryDark },
  connector: { width: 2, flex: 1, minHeight: 24, backgroundColor: Colors.gray[200] },
  connectorReached: { backgroundColor: Colors.primary },
  labelColumn: { flex: 1, paddingBottom: Spacing.lg, paddingLeft: Spacing.sm, paddingTop: 6 },
  label: { fontSize: FontSize.sm, color: Colors.text.muted, fontWeight: '600' },
  labelReached: { color: Colors.text.primary },
  timestamp: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },
  terminal: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.background.alt,
    borderRadius: BorderRadius.md,
  },
  terminalText: { marginLeft: Spacing.sm, color: Colors.text.secondary, fontSize: FontSize.sm },
});
