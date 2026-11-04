import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { RootState } from '@/store';
import { ordersApi } from '@/api/orders.api';
import type { Order, OrderStatus } from '@/types';
import { useFormatPrice } from '@/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { SignInPrompt } from '@/components/SignInPrompt';
import { StatusBadge } from '@/components/StatusBadge';

// The three tabs a buyer thinks in, mapped onto the eight statuses the API
// actually returns. Anything not listed here is not shown under any tab, which
// is why REFUNDED sits under Cancelled rather than being dropped.
const TABS = ['Active', 'Completed', 'Cancelled'] as const;
type Tab = (typeof TABS)[number];

const TAB_STATUSES: Record<Tab, OrderStatus[]> = {
  Active: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY'],
  Completed: ['DELIVERED'],
  Cancelled: ['CANCELLED', 'REFUNDED'],
};

const EMPTY_COPY: Record<Tab, { title: string; subtitle: string }> = {
  Active: {
    title: 'No orders in progress',
    subtitle: 'Orders you place will show up here while they are being prepared and delivered.',
  },
  Completed: {
    title: 'No completed orders yet',
    subtitle: 'Once an order is delivered it moves here so you can reorder or review it.',
  },
  Cancelled: {
    title: 'Nothing cancelled',
    subtitle: 'Cancelled and refunded orders are kept here for your records.',
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function OrdersScreen() {
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const [activeTab, setActiveTab] = useState<Tab>('Active');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const formatPrice = useFormatPrice();
  const insets = useSafeAreaInsets();

  // Fetched unfiltered and split client-side: the tabs are a grouping of
  // several statuses each, and the API filters by one status at a time.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await ordersApi.getOrders());
    } catch {
      setError('Could not load your orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
    else setLoading(false);
  }, [load, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <SignInPrompt
        redirectTo="/(tabs)/orders"
        icon="clipboard-list-outline"
        title="Sign in to see your orders"
        message="Track deliveries, view past purchases and manage returns from your account."
      />
    );
  }

  const filteredOrders = orders.filter((o) => TAB_STATUSES[activeTab].includes(o.status));

  const renderItem = ({ item }: { item: Order }) => {
    const itemCount = item.items?.length ?? 0;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Order ${item.orderNumber}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.orderId}>{item.orderNumber}</Text>
            <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.itemCount}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
            <Text style={styles.total}>{formatPrice(item.total, item.currency)}</Text>
          </View>
          <View style={styles.viewRow}>
            <Text style={styles.viewText}>View details</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.link} />
          </View>
        </View>

        {item.trackingNumber ? (
          <View style={styles.trackingRow}>
            <MaterialCommunityIcons name="truck-outline" size={14} color={Colors.text.muted} />
            <Text style={styles.trackingText}>Tracking {item.trackingNumber}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>My Orders</Text>

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && orders.length === 0 ? (
        <ListSkeleton count={4} height={112} />
      ) : error && orders.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <FlashList
          data={filteredOrders}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState
              icon="package-variant"
              title={EMPTY_COPY[activeTab].title}
              subtitle={EMPTY_COPY[activeTab].subtitle}
              actionLabel="Start shopping"
              onAction={() => router.push('/(tabs)')}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text.primary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { color: Colors.text.muted, fontWeight: '600', fontSize: FontSize.sm },
  activeTabText: { color: Colors.text.primary },
  list: { padding: Spacing.md },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1, paddingRight: Spacing.sm },
  orderId: { fontWeight: '700', fontSize: FontSize.md, color: Colors.text.primary },
  date: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.md },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  itemCount: { color: Colors.text.muted, fontSize: FontSize.xs },
  total: { fontWeight: '800', color: Colors.price, fontSize: FontSize.lg, marginTop: 2 },
  viewRow: { flexDirection: 'row', alignItems: 'center' },
  viewText: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },
  trackingRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  trackingText: { color: Colors.text.muted, fontSize: FontSize.xs, marginLeft: Spacing.xs },
});
