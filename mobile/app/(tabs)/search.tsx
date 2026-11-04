import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { AppDispatch, RootState } from '@/store';
import { fetchCategoriesThunk, searchProductsThunk, clearSearchResults } from '@/store/products.slice';
import type { ProductSortBy } from '@/api/products.api';
import type { Product } from '@/types';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { CategoryCard } from '@/components/CategoryCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ProductCard } from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/LoadingSkeleton';
import { SectionHeader } from '@/components/SectionHeader';

/** The five modes search-service accepts — see SearchQuerySchema. */
const SORTS: Array<{ value: ProductSortBy; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
];

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

export default function SearchScreen() {
  const { q: initialQuery, category } = useLocalSearchParams<{ q?: string; category?: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();

  const results = useSelector((s: RootState) => s.products.searchResults);
  const total = useSelector((s: RootState) => s.products.searchTotal);
  const didYouMean = useSelector((s: RootState) => s.products.didYouMean);
  const loading = useSelector((s: RootState) => s.products.searchLoading);
  const error = useSelector((s: RootState) => s.products.searchError);
  const pagination = useSelector((s: RootState) => s.products.pagination);
  const categories = useSelector((s: RootState) => s.products.categories);

  const [query, setQuery] = useState(initialQuery ?? '');
  const [sortBy, setSortBy] = useState<ProductSortBy>('relevance');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters = useMemo(
    () => ({
      category: category || undefined,
      sortBy,
      inStock: inStockOnly ? ('true' as const) : undefined,
      limit: PAGE_SIZE,
    }),
    [category, sortBy, inStockOnly],
  );

  // A blank query is still a valid search when a category is in play — that is
  // how "browse this category" lands here from Home.
  const canSearch = query.trim().length > 0 || !!category;

  const runSearch = useCallback(
    (page: number, append: boolean) => {
      void dispatch(searchProductsThunk({ query: query.trim(), filters, append, page }));
    },
    [dispatch, filters, query],
  );

  useEffect(() => {
    void dispatch(fetchCategoriesThunk());
  }, [dispatch]);

  // Debounced so a typed word is one request rather than one per keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!canSearch) {
      dispatch(clearSearchResults());
      return;
    }
    timer.current = setTimeout(() => runSearch(1, false), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [canSearch, runSearch, dispatch]);

  const loadMore = useCallback(() => {
    if (loading || !pagination.hasMore) return;
    runSearch(pagination.page + 1, true);
  }, [loading, pagination, runSearch]);

  const activeCategory = categories.find((c) => c.slug === category || c.id === category);

  const renderItem = ({ item }: { item: Product }) => (
    <View style={styles.gridCell}>
      <ProductCard product={item} variant="grid" returnTo="/(tabs)/search" />
    </View>
  );

  const isFirstPage = loading && results.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Search MUNI"
          onChangeText={setQuery}
          value={query}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          onClearIconPress={() => dispatch(clearSearchResults())}
          returnKeyType="search"
          onSubmitEditing={() => canSearch && runSearch(1, false)}
        />
        <TouchableOpacity
          style={[styles.filterButton, showFilters && styles.filterButtonActive]}
          onPress={() => setShowFilters((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel="Sort and filter"
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={22}
            color={showFilters ? Colors.text.onAccent : Colors.text.primary}
          />
        </TouchableOpacity>
      </View>

      {activeCategory ? (
        <View style={styles.contextRow}>
          <Text style={styles.contextLabel}>In {activeCategory.name}</Text>
          <TouchableOpacity onPress={() => router.setParams({ category: undefined })}>
            <Text style={styles.contextClear}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showFilters ? (
        <View style={styles.filters}>
          <Text style={styles.filterHeading}>Sort by</Text>
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

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setInStockOnly((prev) => !prev)}
            accessibilityRole="switch"
            accessibilityState={{ checked: inStockOnly }}
          >
            <MaterialCommunityIcons
              name={inStockOnly ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={inStockOnly ? Colors.primary : Colors.gray[500]}
            />
            <Text style={styles.toggleText}>In stock only</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!canSearch ? (
        <ScrollView contentContainerStyle={styles.browse} keyboardShouldPersistTaps="handled">
          <SectionHeader
            title="Browse categories"
            subtitle="Pick a department to start"
            actionLabel="See all"
            onAction={() => router.push('/(tabs)/categories')}
          />
          <View style={styles.categoryGrid}>
            {categories.slice(0, 8).map((cat) => (
              <View key={cat.id} style={styles.categoryCell}>
                <CategoryCard
                  category={cat}
                  onPress={() => router.push(`/category/${cat.slug || cat.id}`)}
                />
              </View>
            ))}
          </View>
          {categories.length === 0 ? (
            <Text style={styles.hint}>Type what you are looking for to search the marketplace.</Text>
          ) : null}
        </ScrollView>
      ) : isFirstPage ? (
        <ProductGridSkeleton count={6} />
      ) : error && results.length === 0 ? (
        <ErrorState
          title="Search is unavailable"
          message={error}
          onRetry={() => runSearch(1, false)}
        />
      ) : (
        <FlashList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            results.length > 0 ? (
              <View style={styles.resultHeader}>
                <Text style={styles.resultCount}>
                  {total} result{total === 1 ? '' : 's'}
                  {query.trim() ? ` for “${query.trim()}”` : ''}
                </Text>
                {didYouMean ? (
                  <TouchableOpacity onPress={() => setQuery(didYouMean)}>
                    <Text style={styles.didYouMean}>
                      Did you mean <Text style={styles.didYouMeanTerm}>{didYouMean}</Text>?
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="magnify-close"
              title="No matches"
              subtitle={
                query.trim()
                  ? `We could not find anything for “${query.trim()}”. Try a different word or clear your filters.`
                  : 'Nothing is listed in this category yet.'
              }
              actionLabel="Browse categories"
              onAction={() => router.push('/(tabs)/categories')}
            />
          }
          ListFooterComponent={
            loading && results.length > 0 ? (
              <ActivityIndicator style={styles.footerSpinner} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.background.primary,
  },
  searchbar: {
    flex: 1,
    backgroundColor: Colors.background.alt,
    borderRadius: BorderRadius.full,
    height: 46,
  },
  searchInput: { fontSize: FontSize.sm, minHeight: 0 },
  filterButton: {
    marginLeft: Spacing.sm,
    width: 46,
    height: 46,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.alt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: { backgroundColor: Colors.primary },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.background.primary,
  },
  contextLabel: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600' },
  contextClear: { color: Colors.link, fontSize: FontSize.sm, fontWeight: '600' },
  filters: {
    backgroundColor: Colors.background.primary,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  filterHeading: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  chipRow: { paddingHorizontal: Spacing.lg },
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    minHeight: 44,
  },
  toggleText: { marginLeft: Spacing.sm, fontSize: FontSize.sm, color: Colors.text.primary },
  browse: { padding: Spacing.lg },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  categoryCell: { width: '25%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.md },
  hint: { color: Colors.text.muted, textAlign: 'center', marginTop: Spacing.xl, fontSize: FontSize.sm },
  list: { padding: Spacing.sm, paddingBottom: Spacing.xl },
  gridCell: { flex: 1, padding: Spacing.xs },
  resultHeader: { paddingHorizontal: Spacing.xs, paddingVertical: Spacing.sm },
  resultCount: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600' },
  didYouMean: { color: Colors.text.muted, fontSize: FontSize.sm, marginTop: Spacing.xs },
  didYouMeanTerm: { color: Colors.link, fontWeight: '700' },
  footerSpinner: { marginVertical: Spacing.lg },
});
