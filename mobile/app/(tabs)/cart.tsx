import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Button, IconButton, ActivityIndicator, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import {
  fetchCartThunk,
  updateCartItemThunk,
  removeCartItemThunk,
  clearCartError,
} from '@/store/cart.slice';
import type { CartItem } from '@/types';
import { useFormatPrice } from '@/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { FallbackImage } from '@/components/FallbackImage';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { QuantitySelector } from '@/components/QuantitySelector';
import { SignInPrompt } from '@/components/SignInPrompt';

export default function CartScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const {
    items,
    subtotal,
    itemCount,
    couponCode,
    couponDiscount,
    couponMessage,
    isLoading,
    pendingItemIds,
    error,
  } = useSelector((s: RootState) => s.cart);
  const formatPrice = useFormatPrice();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // cart-service keys the cart on the authenticated identity, so there is
    // nothing to fetch for a guest — see the note in store/cart.slice.ts.
    if (isAuthenticated) void dispatch(fetchCartThunk());
  }, [dispatch, isAuthenticated]);

  const refresh = useCallback(() => {
    void dispatch(fetchCartThunk());
  }, [dispatch]);

  // Quantity 0 removes the line server-side, so "−" at 1 and the bin button are
  // the same operation. Both go through the service rather than being applied
  // locally first, which keeps the subtotal authoritative — it is computed by
  // cart-service, not summed here.
  const setQuantity = useCallback(
    (item: CartItem, quantity: number) => {
      if (quantity <= 0) {
        void dispatch(removeCartItemThunk({ itemId: item.id }));
        return;
      }
      // maxQuantity is the seller's stock ceiling; the service rejects above it.
      if (quantity > item.maxQuantity) return;
      void dispatch(updateCartItemThunk({ itemId: item.id, quantity }));
    },
    [dispatch],
  );

  if (!isAuthenticated) {
    return (
      <SignInPrompt
        redirectTo="/(tabs)/cart"
        icon="cart-outline"
        title="Sign in to use your cart"
        message="Your MUNI cart is tied to your account, so it is waiting for you on every device once you sign in."
      />
    );
  }

  const renderItem = ({ item }: { item: CartItem }) => {
    const busy = pendingItemIds.includes(item.id);
    const atMax = item.quantity >= item.maxQuantity;

    return (
      <View style={styles.cartItem}>
        <TouchableOpacity
          onPress={() => router.push(`/product/${item.productId}`)}
          accessibilityRole="button"
          accessibilityLabel={`View ${item.productName}`}
        >
          <FallbackImage uri={item.productImage} style={styles.itemImage} contentFit="cover" />
        </TouchableOpacity>

        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.productName}
          </Text>
          {item.variantLabel ? <Text style={styles.variant}>{item.variantLabel}</Text> : null}
          <Text style={styles.itemPrice}>{formatPrice(item.price)}</Text>

          <View style={styles.quantityRow}>
            {busy ? (
              <View style={styles.quantityBusy}>
                <ActivityIndicator size={18} />
              </View>
            ) : (
              <QuantitySelector
                value={item.quantity}
                onChange={(next) => setQuantity(item, next)}
                min={0}
                max={item.maxQuantity}
                size="sm"
              />
            )}
            <IconButton
              icon="delete-outline"
              iconColor={Colors.text.muted}
              size={20}
              disabled={busy}
              onPress={() => dispatch(removeCartItemThunk({ itemId: item.id }))}
              accessibilityLabel={`Remove ${item.productName} from cart`}
            />
          </View>
          {atMax ? <Text style={styles.maxNote}>Only {item.maxQuantity} left in stock</Text> : null}
        </View>
      </View>
    );
  };

  const errorBar = (
    <Snackbar
      visible={!!error}
      onDismiss={() => dispatch(clearCartError())}
      action={{ label: 'Retry', onPress: refresh }}
    >
      {error ?? ''}
    </Snackbar>
  );

  // Skeleton only on first load; a pull-to-refresh keeps the list up and uses
  // the RefreshControl instead.
  if (isLoading && items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>My Cart</Text>
        <ListSkeleton count={3} height={104} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          subtitle="Browse the marketplace and add something you like — it will show up here."
          actionLabel="Start shopping"
          onAction={() => router.push('/(tabs)')}
        />
        {errorBar}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Text style={styles.title}>
            My Cart <Text style={styles.count}>({itemCount})</Text>
          </Text>
        }
        ListFooterComponent={
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Order summary</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
            </View>

            {couponDiscount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Discount{couponCode ? ` (${couponCode})` : ''}
                </Text>
                <Text style={styles.discount}>-{formatPrice(couponDiscount)}</Text>
              </View>
            )}

            {/* Surfaced because a silently-ignored coupon reads to the customer
                as the code simply not working. cart-service sets this when a
                code was rejected or could not be checked. */}
            {couponMessage ? <Text style={styles.couponNote}>{couponMessage}</Text> : null}

            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalText}>Total</Text>
              <Text style={styles.totalText}>{formatPrice(subtotal - couponDiscount)}</Text>
            </View>

            {/* Tax and delivery are deliberately absent. cart-service computes
                neither — they come from tax-service and shipping-service during
                the checkout saga and depend on an address the cart has not
                asked for yet. This screen used to invent a flat 18% tax line,
                which showed a total the checkout then contradicted. */}
            <Text style={styles.footnote}>Delivery and taxes are calculated at checkout.</Text>
          </View>
        }
      />

      {/* No bottom inset here: this screen sits inside the tabs, and the tab
          bar already reserves the home-indicator space below it. */}
      <View style={styles.footer}>
        <View style={styles.footerTotals}>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{formatPrice(subtotal - couponDiscount)}</Text>
        </View>
        <Button
          mode="contained"
          onPress={() => router.push('/checkout')}
          style={styles.checkoutBtn}
          contentStyle={styles.checkoutBtnContent}
        >
          Checkout ({itemCount})
        </Button>
      </View>

      {errorBar}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  listContent: { paddingBottom: Spacing.lg },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text.primary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  count: { fontSize: FontSize.lg, color: Colors.text.muted, fontWeight: '600' },
  cartItem: {
    flexDirection: 'row',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  itemImage: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.alt,
  },
  itemInfo: { flex: 1, marginLeft: Spacing.md },
  itemName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text.primary },
  variant: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 2 },
  itemPrice: { color: Colors.price, fontWeight: '700', fontSize: FontSize.md, marginTop: Spacing.xs },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  quantityBusy: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md },
  maxNote: { color: Colors.warning, fontSize: FontSize.xs },
  summary: {
    padding: Spacing.lg,
    margin: Spacing.md,
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  summaryTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  summaryLabel: { color: Colors.text.secondary, fontSize: FontSize.sm },
  summaryValue: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  discount: { color: Colors.success, fontSize: FontSize.sm, fontWeight: '600' },
  couponNote: { color: Colors.text.muted, fontSize: FontSize.xs, marginBottom: Spacing.sm },
  totalRow: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  totalText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text.primary },
  footnote: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  footerTotals: { flex: 1 },
  footerLabel: { fontSize: FontSize.xs, color: Colors.text.muted },
  footerTotal: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.price },
  checkoutBtn: { borderRadius: BorderRadius.full, minWidth: 170 },
  checkoutBtnContent: { minHeight: 48, paddingHorizontal: Spacing.sm },
});
