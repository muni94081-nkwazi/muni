import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import {
  clearSearchResults,
  fetchCategoriesThunk,
  searchProductsThunk,
} from '@/store/products.slice';
import type { ProductSortBy } from '@/api/products.api';
import type { Product } from '@/types';
import { findCategory, findCategoryPath } from '@/utils/categoryTree';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ProductCard } from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/LoadingSkeleton';

const SORTS: Array<{ value: ProductSortBy; label: string }> = [
  { value: 'relevance', label: 'Featured' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
];

const PAGE_SIZE = 20;

/**
 * Everything in one department.
 *
 * Goes through search-service rather than product-service's list because that
 * is the endpoint with real sorting, paging and a category filter that accepts
 * either a slug or an id — the same call the search screen makes, with an empty
 * query and the category pinned.
 */
export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dispatch = useDispatch<AppDispatch>();

  const products = useSelector((s: RootState) => s.products.searchResults);
  const total = useSelector((s: RootState) => s.products.searchTotal);
  const loading = useSelector((s: RootState) => s.products.searchLoading);
  const error = useSelector((s: RootState) => s.products.searchError);
  const pagination = useSelector((s: RootState) => s.products.pagination);
  const categories = useSelector((s: RootState) => s.products.categories);

  const [sortBy, setSortBy] = useState<ProductSortBy>('relevance');

  // Walks the whole tree: an aisle like "phones" lives inside Electronics'
  // `children`, so the old roots-only find() returned undefined for every
  // subcategory and the screen fell back to the generic "Category" title.
  const category = useMemo(() => findCategory(categories, slug ?? ''), [categories, slug]);
  const ancestry = useMemo(() => findCategoryPath(categories, slug ?? ''), [categories, slug]);

  const title = category?.name ?? 'Category';
  const returnTo = `/category/${slug}`;

  // Only the departments above this one — the last entry is the category itself.
  const parents = ancestry.slice(0, -1);
  const subcategories = category?.children ?? [];

  const load = useCallback(
    (page: number, append: boolean) => {
      if (!slug) return;
      void dispatch(
        searchProductsThunk({
          query: '',
          filters: { category: slug, sortBy, limit: PAGE_SIZE },
          append,
          page,
        }),
      );
    },
    [dispatch, slug, sortBy],
  );

  useEffect(() => {
    if (categories.length === 0) void dispatch(fetchCategoriesThunk());
  }, [dispatch, categories.length]);

  useEffect(() => {
    // Results are shared with the search screen, so start from a clean list
    // rather than showing the previous query's products under this heading.
    dispatch(clearSearchResults());
    load(1, false);
  }, [dispatch, load]);

  const loadMore = useCallback(() => {
    if (loading || !pagination.hasMore) return;
    load(pagination.page + 1, true);
  }, [loading, pagination, load]);

  const renderItem = ({ item }: { item: Product }) => (
    <View style={styles.gridCell}>
      <ProductCard product={item} variant="grid" returnTo={returnTo} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title }} />

      {parents.length > 0 && (
        <TouchableOpacity
          style={styles.breadcrumb}
          onPress={() => {
            const parent = parents[parents.length - 1];
            router.push(`/category/${parent.slug || parent.id}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${parents[parents.length - 1].name}`}
        >
          <MaterialCommunityIcons name="chevron-left" size={16} color={Colors.text.secondary} />
          <Text style={styles.breadcrumbText} numberOfLines={1}>
            {parents.map((p) => p.name).join(' › ')}
          </Text>
        </TouchableOpacity>
      )}

      {subcategories.length > 0 && (
        <View style={styles.subRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {subcategories.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={styles.subChip}
                onPress={() => router.push(`/category/${child.slug || child.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Narrow to ${child.name}`}
              >
                <Text style={styles.subChipText} numberOfLines={1}>
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SORTS.map((option) => {
            const active = sortBy === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSortBy(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && products.length === 0 ? (
        <ProductGridSkeleton count={6} />
      ) : error && products.length === 0 ? (
        <ErrorState title="Could not load this category" message={error} onRetry={() => load(1, false)} />
      ) : (
        <FlashList
          data={products}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            products.length > 0 ? (
              <Text style={styles.count}>
                {total} product{total === 1 ? '' : 's'} in {title}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="package-variant"
              title="Nothing here yet"
              subtitle={`No products are listed in ${title} right now. Try another department or search instead.`}
              actionLabel="Browse categories"
              onAction={() => router.push('/(tabs)/categories')}
            />
          }
          ListFooterComponent={
            loading && products.length > 0 ? <ActivityIndicator style={styles.footerSpinner} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background.primary,
  },
  breadcrumbText: { fontSize: FontSize.xs, color: Colors.text.secondary, flexShrink: 1 },
  subRow: {
    backgroundColor: Colors.background.primary,
    paddingBottom: Spacing.sm,
  },
  subChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.alt,
    marginRight: Spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  subChipText: { fontSize: FontSize.sm, color: Colors.text.primary, fontWeight: '600' },
  toolbar: {
    backgroundColor: Colors.background.primary,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  chipRow: { paddingHorizontal: Spacing.md },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}1A` },
  chipText: { fontSize: FontSize.sm, color: Colors.text.secondary, fontWeight: '600' },
  chipTextActive: { color: Colors.primaryDark },
  list: { padding: Spacing.sm, paddingBottom: Spacing.xl },
  gridCell: { flex: 1, padding: Spacing.xs },
  count: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  footerSpinner: { marginVertical: Spacing.lg },
});
