import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { RootState } from '@/store';
import { ordersApi } from '@/api/orders.api';
import type { Order, OrderItem } from '@/types';
import { useFormatPrice, formatDate } from '@/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { FallbackImage } from '@/components/FallbackImage';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton, SkeletonBlock } from '@/components/LoadingSkeleton';
import { OrderTracker } from '@/components/OrderTracker';
import { SignInPrompt } from '@/components/SignInPrompt';
import { StatusBadge } from '@/components/StatusBadge';

/**
 * Order detail.
 *
 * Built because both the review flow and the returns flow are specified as
 * "reachable from order detail", and no such screen existed — the orders tab
 * rendered a hardcoded list with a no-op row press.
 *
 * Review and return entry points appear only once an order is DELIVERED. That
 * is a UI convenience: review-service and return-service each enforce their own
 * eligibility and will refuse an ineligible request regardless of what this
 * screen showed.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const formatPrice = useFormatPrice();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await ordersApi.getOrderById(id));
    } catch {
      setError('Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthenticated) void load();
    else setLoading(false);
  }, [load, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <Stack.Screen options={{ title: 'Order' }} />
        <SignInPrompt
          redirectTo={`/order/${id}`}
          icon="receipt"
          title="Sign in to view this order"
          message="Orders are private to the account that placed them."
        />
      </>
    );
  }

  if (loading && !order) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Order' }} />
        <View style={styles.card}>
          <SkeletonBlock height={22} width="60%" />
          <SkeletonBlock height={160} style={styles.skeletonBlock} />
        </View>
        <ListSkeleton count={2} height={72} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Order' }} />
        <ErrorState
          title="Order unavailable"
          message={error ?? 'We could not find that order.'}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  const delivered = order.status === 'DELIVERED';

  const renderItem = (item: OrderItem) => (
    <View key={`${item.productId}-${item.variantLabel ?? ''}`} style={styles.itemRow}>
      <FallbackImage uri={item.imageUrl} style={styles.itemImage} contentFit="cover" />
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.variantLabel ? <Text style={styles.meta}>{item.variantLabel}</Text> : null}
        <Text style={styles.meta}>
          {item.quantity} × {formatPrice(item.price, order.currency)}
        </Text>

        {delivered && (
          <Button
            mode="text"
            compact
            style={styles.itemAction}
            onPress={() =>
              router.push({
                pathname: '/product/[id]/review',
                params: { id: item.productId, orderId: order.id, productName: item.name },
              })
            }
          >
            Write a review
          </Button>
        )}
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <Stack.Screen options={{ title: order.orderNumber }} />

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Order {order.orderNumber}</Text>
            <Text style={styles.meta}>Placed {formatDate(order.createdAt)}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>

        <View style={styles.divider} />

        <OrderTracker
          status={order.status}
          placedAt={formatDate(order.createdAt)}
          estimatedDelivery={order.estimatedDelivery ? formatDate(order.estimatedDelivery) : undefined}
        />

        {order.trackingNumber ? (
          <View style={styles.trackingRow}>
            <MaterialCommunityIcons name="barcode-scan" size={16} color={Colors.text.muted} />
            <Text style={styles.trackingText}>Tracking number {order.trackingNumber}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          {order.items.length} item{order.items.length === 1 ? '' : 's'}
        </Text>
        {order.items.map(renderItem)}
      </View>

      {order.shippingAddress ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery address</Text>
          <Text style={styles.addressLine}>{order.shippingAddress.fullName}</Text>
          <Text style={styles.addressMuted}>{order.shippingAddress.street}</Text>
          <Text style={styles.addressMuted}>
            {[order.shippingAddress.city, order.shippingAddress.district, order.shippingAddress.country]
              .filter(Boolean)
              .join(', ')}
          </Text>
          {order.shippingAddress.phone ? (
            <Text style={styles.addressMuted}>{order.shippingAddress.phone}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payment summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatPrice(order.subtotal, order.currency)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery</Text>
          <Text style={styles.summaryValue}>{formatPrice(order.shipping, order.currency)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tax</Text>
          <Text style={styles.summaryValue}>{formatPrice(order.tax, order.currency)}</Text>
        </View>
        {order.discount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Discount</Text>
            <Text style={styles.discount}>−{formatPrice(order.discount, order.currency)}</Text>
          </View>
        )}
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalText}>Total</Text>
          <Text style={styles.totalText}>{formatPrice(order.total, order.currency)}</Text>
        </View>
        {order.paymentMethod ? (
          <Text style={styles.meta}>Paid with {order.paymentMethod.replace(/_/g, ' ')}</Text>
        ) : null}
      </View>

      {delivered && (
        <Button
          mode="outlined"
          style={styles.footerAction}
          contentStyle={styles.footerActionContent}
          onPress={() => router.push({ pathname: '/returns', params: { orderId: order.id } })}
        >
          Return or report a problem
        </Button>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  skeletonBlock: { marginTop: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: Spacing.sm },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text.primary },
  meta: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 4 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.md },
  trackingRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  trackingText: { marginLeft: Spacing.xs, color: Colors.text.secondary, fontSize: FontSize.xs },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  itemRow: { flexDirection: 'row', marginBottom: Spacing.md },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.alt,
  },
  itemInfo: { flex: 1, marginLeft: Spacing.md },
  itemName: { fontWeight: '600', fontSize: FontSize.sm, color: Colors.text.primary },
  itemAction: { alignSelf: 'flex-start', marginTop: 2, marginLeft: -8 },
  addressLine: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.primary },
  addressMuted: { fontSize: FontSize.sm, color: Colors.text.secondary, marginTop: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  summaryLabel: { color: Colors.text.secondary, fontSize: FontSize.sm },
  summaryValue: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  discount: { color: Colors.success, fontSize: FontSize.sm, fontWeight: '600' },
  totalRow: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  totalText: { fontWeight: '800', fontSize: FontSize.lg, color: Colors.text.primary },
  footerAction: { borderRadius: BorderRadius.full, borderColor: Colors.border },
  footerActionContent: { minHeight: 48 },
});
