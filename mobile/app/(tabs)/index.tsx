import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import { fetchCategoriesThunk } from '@/store/products.slice';
import { productsApi } from '@/api/products.api';
import type { Product } from '@/types';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { CategoryCard } from '@/components/CategoryCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ProductCard } from '@/components/ProductCard';
import { ProductGridSkeleton, ProductRailSkeleton } from '@/components/LoadingSkeleton';
import { SectionHeader } from '@/components/SectionHeader';

// product-service's list query has no "featured" or "flash sale" concept — see
// ListProductsSchema: q, category, price/rating bounds, inStock, sellerId, sort.
// So the two rails below are the two orderings it does support, labelled for
// what they actually are. The screen used to carry a third "Flash Sale" rail
// with a hardcoded 02:15:30 countdown and the same ten fake products; there is
// no promotion behind it, so it is gone rather than lying about a deadline.
const RAIL_SIZE = 10;

export default function HomeScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();
  const firstName = useSelector((s: RootState) => s.auth.user?.firstName);
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const cartCount = useSelector((s: RootState) => s.cart.itemCount);
  const categories = useSelector((s: RootState) => s.products.categories);

  const [topRated, setTopRated] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // page is 0-indexed server-side (ListProductsSchema: min(0).default(0)).
      const [rated, latest] = await Promise.all([
        productsApi.getProducts({ sort: 'rating', limit: RAIL_SIZE, page: 0 }),
        productsApi.getProducts({ sort: 'newest', limit: RAIL_SIZE, page: 0 }),
      ]);
      setTopRated(rated.products);
      setNewArrivals(latest.products);
      void dispatch(fetchCategoriesThunk());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the storefront');
    }
  }, [dispatch]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const isEmpty = !loading && !error && topRated.length === 0 && newArrivals.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Marketplace header ────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerTop}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>MUNI</Text>
            <Text style={styles.greeting} numberOfLines={1}>
              {firstName ? `Hello, ${firstName}` : 'Everything you need, in one place'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/(tabs)/wishlist')}
              accessibilityRole="button"
              accessibilityLabel="Wishlist"
            >
              <MaterialCommunityIcons name="heart-outline" size={24} color={Colors.text.inverse} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/(tabs)/cart')}
              accessibilityRole="button"
              accessibilityLabel={`Cart, ${cartCount} items`}
            >
              <MaterialCommunityIcons name="cart-outline" size={24} color={Colors.text.inverse} />
              {cartCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(tabs)/search')}
          style={styles.searchBar}
          accessibilityRole="search"
          accessibilityLabel="Search products"
        >
          <MaterialCommunityIcons name="magnify" size={22} color={Colors.gray[500]} />
          <Text style={styles.searchText}>Search products, brands and categories</Text>
        </TouchableOpacity>
      </View>

      {/* ── Categories ────────────────────────────────────────────────────── */}
      {categories.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionPadding}>
            <SectionHeader
              title="Shop by category"
              actionLabel="See all"
              onAction={() => router.push('/(tabs)/categories')}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                variant="pill"
                onPress={() => router.push(`/category/${category.slug || category.id}`)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* ── Rails ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <>
          <View style={styles.section}>
            <View style={styles.sectionPadding}>
              <SectionHeader title="Top rated" />
            </View>
            <ProductRailSkeleton count={3} />
          </View>
          <View style={styles.section}>
            <View style={styles.sectionPadding}>
              <SectionHeader title="New arrivals" />
            </View>
            <ProductGridSkeleton count={4} />
          </View>
        </>
      ) : error ? (
        <ErrorState
          compact
          title="Could not load the storefront"
          message={error}
          onRetry={onRefresh}
        />
      ) : isEmpty ? (
        <EmptyState
          icon="storefront-outline"
          title="No products listed yet"
          subtitle="The marketplace is still filling up. Check back shortly or search for something specific."
          actionLabel="Open search"
          onAction={() => router.push('/(tabs)/search')}
        />
      ) : (
        <>
          {topRated.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionPadding}>
                <SectionHeader
                  title="Top rated"
                  subtitle="Highest rated by MUNI shoppers"
                  actionLabel="See all"
                  onAction={() => router.push({ pathname: '/(tabs)/search', params: { q: '' } })}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {topRated.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    variant="rail"
                    returnTo="/(tabs)"
                    style={styles.railCard}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {newArrivals.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionPadding}>
                <SectionHeader title="New arrivals" subtitle="Just listed on MUNI" />
              </View>
              <View style={styles.grid}>
                {newArrivals.map((product) => (
                  <View key={product.id} style={styles.gridCell}>
                    <ProductCard product={product} variant="grid" returnTo="/(tabs)" />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {!isAuthenticated ? (
            <TouchableOpacity
              style={styles.signInCard}
              onPress={() => router.push('/(auth)/login')}
              accessibilityRole="button"
              accessibilityLabel="Sign in to MUNI"
            >
              <MaterialCommunityIcons name="account-arrow-right-outline" size={24} color={Colors.primaryDark} />
              <View style={styles.signInText}>
                <Text style={styles.signInTitle}>Sign in for a faster checkout</Text>
                <Text style={styles.signInBlurb}>Save items, track orders and keep your cart in sync.</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.gray[400]} />
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  content: { paddingBottom: Spacing.xl },
  header: {
    backgroundColor: Colors.nav.primary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandBlock: { flex: 1, paddingRight: Spacing.md },
  brand: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },
  greeting: { fontSize: FontSize.xs, color: Colors.gray[300], marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { padding: Spacing.sm, marginLeft: Spacing.xs },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.text.onAccent },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    height: 44,
    marginTop: Spacing.md,
  },
  searchText: { marginLeft: Spacing.sm, color: Colors.gray[500], fontSize: FontSize.sm, flex: 1 },
  section: { marginTop: Spacing.lg },
  sectionPadding: { paddingHorizontal: Spacing.lg },
  rail: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
  railCard: { marginRight: Spacing.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    marginHorizontal: -Spacing.xs,
  },
  gridCell: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.md },
  signInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.card,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  signInText: { flex: 1, marginHorizontal: Spacing.md },
  signInTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text.primary },
  signInBlurb: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },
});
