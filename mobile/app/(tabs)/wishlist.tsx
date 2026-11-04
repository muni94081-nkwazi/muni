import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, IconButton, ActivityIndicator, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import {
  fetchWishlistsThunk,
  removeWishlistItemThunk,
  clearWishlistError,
  selectActiveWishlist,
  selectWishlistItems,
} from '@/store/wishlist.slice';
import type { WishlistItem } from '@/api/wishlist.api';
import { useFormatPrice } from '@/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { FallbackImage } from '@/components/FallbackImage';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { SignInPrompt } from '@/components/SignInPrompt';

export default function WishlistScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const wishlist = useSelector(selectActiveWishlist);
  const items = useSelector(selectWishlistItems);
  const { isLoading, error, pendingItemIds } = useSelector((s: RootState) => s.wishlist);
  const formatPrice = useFormatPrice();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // wishlist-service keys lists on the authenticated user, so a guest has
    // nothing to fetch — and fetchWishlistsThunk would create a list on a 200.
    if (isAuthenticated) void dispatch(fetchWishlistsThunk());
  }, [dispatch, isAuthenticated]);

  const refresh = useCallback(() => {
    void dispatch(fetchWishlistsThunk());
  }, [dispatch]);

  const remove = useCallback(
    (itemId: string) => {
      if (!wishlist) return;
      void dispatch(removeWishlistItemThunk({ wishlistId: wishlist.id, itemId }));
    },
    [dispatch, wishlist],
  );

  if (!isAuthenticated) {
    return (
      <SignInPrompt
        redirectTo="/(tabs)/wishlist"
        icon="heart-outline"
        title="Sign in to save items"
        message="Keep the products you like in one place and get told when their price drops."
      />
    );
  }

  const renderItem = ({ item }: { item: WishlistItem }) => {
    // The service snapshots the price at add-time, so a drop since then is
    // knowable without a second lookup — which is most of the point of a
    // wishlist. Only ever shown as a drop; a rise is not something to advertise.
    const dropped = item.currentPrice < item.priceAtAdd;
    const removing = pendingItemIds.includes(item.id);

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/product/${item.productId}`)}
        disabled={removing}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.productName}`}
      >
        <FallbackImage uri={item.productImage} style={styles.image} contentFit="cover" />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {item.productName}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(item.currentPrice)}</Text>
            {dropped && <Text style={styles.wasPrice}>{formatPrice(item.priceAtAdd)}</Text>}
          </View>
          {dropped && (
            <View style={styles.dropBadge}>
              <Text style={styles.dropText}>
                Price dropped {formatPrice(item.priceAtAdd - item.currentPrice)}
              </Text>
            </View>
          )}
        </View>
        {removing ? (
          <ActivityIndicator style={styles.rowSpinner} />
        ) : (
          <IconButton
            icon="heart-off-outline"
            iconColor={Colors.error}
            onPress={() => remove(item.id)}
            accessibilityLabel={`Remove ${item.productName} from wishlist`}
          />
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading && items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>My Wishlist</Text>
        <ListSkeleton count={4} height={88} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>
        {wishlist?.name ?? 'My Wishlist'}
        {items.length > 0 ? <Text style={styles.count}> ({items.length})</Text> : null}
      </Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title="Nothing saved yet"
            subtitle="Tap the heart on any product to keep it here and watch its price."
            actionLabel="Browse products"
            onAction={() => router.push('/(tabs)')}
          />
        }
      />

      <Snackbar
        visible={!!error}
        onDismiss={() => dispatch(clearWishlistError())}
        action={{ label: 'Retry', onPress: refresh }}
      >
        {error ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text.primary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  count: { fontSize: FontSize.lg, color: Colors.text.muted, fontWeight: '600' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  emptyList: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  image: {
    width: 76,
    height: 76,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.alt,
  },
  info: { flex: 1, marginLeft: Spacing.md },
  name: { fontWeight: '600', fontSize: FontSize.sm, color: Colors.text.primary, marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { color: Colors.price, fontWeight: '700', fontSize: FontSize.md },
  wasPrice: {
    marginLeft: Spacing.sm,
    color: Colors.text.muted,
    textDecorationLine: 'line-through',
    fontSize: FontSize.xs,
  },
  dropBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    backgroundColor: `${Colors.success}1A`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  dropText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '700' },
  rowSpinner: { marginHorizontal: Spacing.md },
});
