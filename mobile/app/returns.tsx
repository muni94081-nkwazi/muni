import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Button, ActivityIndicator, Chip, Divider } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import {
  returnsApi,
  type Dispute,
  type ReturnRequest,
  type ReturnStatus,
} from '@/api/returns.api';
import { Colors, Spacing } from '@/constants/theme';

// Status → chip colour. REQUESTED is deliberately neutral rather than a warning:
// a pending return is the normal path, not a problem.
const STATUS_COLOR: Record<ReturnStatus, string> = {
  REQUESTED: Colors.gray[400],
  APPROVED: Colors.success,
  REFUNDED: Colors.success,
  REJECTED: Colors.error,
  CANCELLED: Colors.gray[400],
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Returns and disputes for the signed-in buyer.
 *
 * Reached from order detail. `orderId` may arrive as a param when the user came
 * from a specific order — it filters the list rather than opening a form, so
 * the screen answers "what happened to my return" in one place.
 */
export default function ReturnsScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Disputes are a different service, so one being down must not blank the
    // returns list — settle both and take what arrived.
    const [returnsResult, disputesResult] = await Promise.allSettled([
      returnsApi.list(),
      returnsApi.listDisputes(),
    ]);

    if (returnsResult.status === 'fulfilled') {
      setReturns(returnsResult.value);
    } else {
      setError('Could not load your return requests.');
    }
    // A dispute failure is silent: the section simply does not render. Returns
    // are the point of this screen.
    setDisputes(disputesResult.status === 'fulfilled' ? disputesResult.value : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleReturns = orderId ? returns.filter((r) => r.orderId === orderId) : returns;
  const visibleDisputes = orderId ? disputes.filter((d) => d.orderId === orderId) : disputes;

  const renderReturn = ({ item }: { item: ReturnRequest }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderId}>Order {item.orderId}</Text>
        <Chip
          compact
          textStyle={styles.chipText}
          style={[styles.chip, { backgroundColor: STATUS_COLOR[item.status] }]}
        >
          {item.status.toLowerCase()}
        </Chip>
      </View>

      <Text style={styles.meta}>Requested {formatDate(item.createdAt)}</Text>

      {item.items.map((line) => (
        <Text key={line.orderItemId} style={styles.line}>
          {line.quantity} × {line.orderItemId} — {line.reason.replace(/_/g, ' ').toLowerCase()}
        </Text>
      ))}

      {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

      <Text style={styles.meta}>
        Refund via {item.refundMethod}
        {/* refundAmount is null for everything a client submitted — the create
            schema has no such field — so it is only shown when actually set. */}
        {typeof item.refundAmount === 'number' ? ` · ${item.refundAmount}` : ''}
      </Text>

      {item.status === 'REQUESTED' && (
        <Button
          mode="text"
          compact
          onPress={() => {
            void returnsApi.cancel(item.id).then(load).catch(() => {
              setError('Could not cancel that return.');
            });
          }}
        >
          Cancel request
        </Button>
      )}
    </View>
  );

  if (loading && returns.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {orderId ? 'Returns for this order' : 'Returns & disputes'}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={visibleReturns}
        keyExtractor={(item) => item.id}
        renderItem={renderReturn}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={
          visibleReturns.length === 0 ? styles.emptyList : styles.list
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No return requests</Text>
            <Text style={styles.emptyBlurb}>
              You can request a return from an order within 14 days of delivery.
            </Text>
            <Button mode="contained" onPress={() => router.push('/(tabs)/orders')}>
              View orders
            </Button>
          </View>
        }
        ListFooterComponent={
          visibleDisputes.length > 0 ? (
            <View style={styles.disputes}>
              <Divider style={styles.divider} />
              <Text style={styles.sectionTitle}>Disputes</Text>
              {visibleDisputes.map((d) => (
                <View key={d.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.orderId}>Order {d.orderId}</Text>
                    <Chip compact style={styles.chip} textStyle={styles.chipText}>
                      {String(d.status).toLowerCase()}
                    </Chip>
                  </View>
                  <Text style={styles.meta}>Opened {formatDate(d.createdAt)}</Text>
                  {d.reason ? <Text style={styles.line}>{d.reason}</Text> : null}
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  title: { fontSize: 22, fontWeight: 'bold', padding: Spacing.lg, paddingBottom: Spacing.sm },
  error: { color: Colors.error, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  emptyList: { flexGrow: 1 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontWeight: '700', flex: 1 },
  chip: { height: 26 },
  chipText: { fontSize: 11, color: Colors.white },
  meta: { color: Colors.gray[400], fontSize: 12, marginTop: 4 },
  line: { marginTop: 6 },
  description: { marginTop: 6, fontStyle: 'italic' },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: Spacing.sm },
  emptyBlurb: { textAlign: 'center', color: Colors.gray[400], marginBottom: Spacing.lg },
  disputes: { marginTop: Spacing.lg },
  divider: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.md },
});
