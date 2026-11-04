import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import { confirmPaymentThunk, resetCheckout } from '@/store/checkout.slice';
import { useFormatPrice } from '@/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

/**
 * Terminal screen for a checkout attempt. Three outcomes, deliberately distinct:
 *
 *   COMPLETED        the order exists; show its id.
 *   PAYMENT_PENDING  the mobile money prompt has not been answered yet. The
 *                    session is re-drivable, so offer that rather than implying
 *                    the purchase failed.
 *   anything else    it did not complete; say why, and do not show a fake
 *                    order number.
 *
 * The previous version hardcoded "Order Confirmed!" and ORD-12345678, so a
 * failed checkout looked identical to a successful one.
 */
export default function OrderConfirmation() {
  const dispatch = useDispatch<AppDispatch>();
  const formatPrice = useFormatPrice();
  const insets = useSafeAreaInsets();
  const { session, isPlacing, error } = useSelector((s: RootState) => s.checkout);

  // Nothing to confirm — reached directly or after a reset.
  useEffect(() => {
    if (!session) router.replace('/(tabs)/cart');
  }, [session]);

  if (!session) return null;

  const done = session.status === 'COMPLETED' && !!session.orderId;
  const pending = session.status === 'PAYMENT_PENDING';

  function leave(to: '/(tabs)/orders' | '/(tabs)') {
    // Clear the attempt on the way out: its idempotency key belongs to a
    // finished purchase, and reusing it would replay this order's response.
    dispatch(resetCheckout());
    router.replace(to);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: done ? 'Order confirmed' : 'Checkout', headerBackVisible: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <MaterialCommunityIcons
          name={done ? 'check-circle' : pending ? 'clock-outline' : 'alert-circle'}
          size={90}
          color={done ? Colors.success : pending ? Colors.warning : Colors.error}
        />

        <Text style={styles.title}>
          {done ? 'Order Confirmed!' : pending ? 'Waiting for payment' : 'Order not completed'}
        </Text>

        <Text style={styles.subtitle}>
          {done
            ? 'Thank you for your purchase.'
            : pending
              ? 'Approve the prompt on your phone, then tap below. Your items are held until you do.'
              : session.failureReason ?? error ?? 'Something stopped this order going through.'}
        </Text>

        {done && (
          <View style={styles.orderBox}>
            <Text style={styles.orderLabel}>Order Number</Text>
            <Text style={styles.orderNumber}>{session.orderId}</Text>
          </View>
        )}

        {/* Server-computed figures — the first point in the flow where delivery
            and tax are actually known. */}
        {(done || pending) && (
          <View style={styles.totals}>
            <Row label="Subtotal" value={formatPrice(session.subtotal)} />
            {session.couponDiscount > 0 && (
              <Row label="Discount" value={`-${formatPrice(session.couponDiscount)}`} />
            )}
            <Row label="Delivery" value={formatPrice(session.shippingCost)} />
            <Row label="Tax" value={formatPrice(session.taxAmount)} />
            <View style={styles.totalRow}>
              <Text style={styles.totalText}>Total</Text>
              <Text style={styles.totalText}>{formatPrice(session.total)}</Text>
            </View>
          </View>
        )}

        {/* Which step stopped it — useful to the customer ("payment declined")
            and to whoever they contact about it. */}
        {!done && !pending && (
          <View style={styles.steps}>
            {session.steps
              .filter((s) => s.status === 'failed')
              .map((s) => (
                <Text key={s.step} style={styles.failedStep}>
                  {s.step.replace(/_/g, ' ').toLowerCase()}: {s.error ?? 'failed'}
                </Text>
              ))}
          </View>
        )}

        {isPlacing && <ActivityIndicator style={styles.spinner} />}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
        {done && (
          <>
            <Button mode="contained" onPress={() => leave('/(tabs)/orders')} style={styles.btn}>
              Track Order
            </Button>
            <Button mode="outlined" onPress={() => leave('/(tabs)')} style={styles.btn}>
              Continue Shopping
            </Button>
          </>
        )}

        {pending && (
          <>
            <Button
              mode="contained"
              loading={isPlacing}
              disabled={isPlacing}
              onPress={() => void dispatch(confirmPaymentThunk())}
              style={styles.btn}
            >
              I have approved the payment
            </Button>
            <Button mode="text" onPress={() => leave('/(tabs)/orders')} style={styles.btn}>
              Check later in My Orders
            </Button>
          </>
        )}

        {!done && !pending && (
          <>
            {/* Back to the cart, not a retry: the basket is intact (the saga
                unwound its reservations) and the customer may need to change
                something — an out-of-stock line especially. */}
            <Button mode="contained" onPress={() => leave('/(tabs)')} style={styles.btn}>
              Back to shopping
            </Button>
            <Button
              mode="outlined"
              onPress={() => {
                dispatch(resetCheckout());
                router.replace('/(tabs)/cart');
              }}
              style={styles.btn}
            >
              Review my cart
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  content: { alignItems: 'center', padding: Spacing.xl, paddingTop: Spacing.xl },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text.primary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.text.muted,
    marginBottom: Spacing.xl,
    textAlign: 'center',
    lineHeight: 20,
  },
  orderBox: {
    backgroundColor: Colors.background.secondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  orderLabel: { color: Colors.text.muted, marginBottom: 4, fontSize: FontSize.xs },
  orderNumber: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text.primary },
  totals: {
    width: '100%',
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  rowLabel: { color: Colors.text.secondary, fontSize: FontSize.sm },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  totalText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text.primary },
  steps: { width: '100%', marginBottom: Spacing.lg },
  failedStep: { color: Colors.error, fontSize: FontSize.sm, marginBottom: 4 },
  spinner: { marginTop: Spacing.md },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  btn: { marginVertical: Spacing.xs, borderRadius: BorderRadius.full },
});
